package com.toucabr.leitorfacil

import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsSupertonicModelConfig
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max

object NeuralSpeech {
    private const val DEFAULT_SPEED = 1.25f
    private const val RELEASE_AFTER_LEAVING_WHATSAPP_MS = 120_000L
    private const val FIRST_CHUNK_TARGET = 82
    private const val FIRST_CHUNK_MAX = 110
    private const val NEXT_CHUNK_MAX = 220

    private val executor = Executors.newSingleThreadExecutor()
    private val generation = AtomicInteger(0)
    private val speaking = AtomicBoolean(false)
    private val keepWarm = AtomicBoolean(false)
    private val releaseHandler = Handler(Looper.getMainLooper())

    @Volatile private var tts: OfflineTts? = null
    @Volatile private var initializing = false
    @Volatile private var primed = false
    @Volatile private var currentTrack: AudioTrack? = null

    private val releaseRunnable = Runnable {
        executor.execute {
            if (!speaking.get() && !keepWarm.get()) {
                try {
                    tts?.release()
                } catch (_: Throwable) {
                }
                tts = null
                primed = false
            }
        }
    }

    /**
     * v3.3 reads the neural model directly from the APK assets.
     * This only removes old copied models left by previous versions.
     */
    fun prepareStorage(context: Context) {
        val app = context.applicationContext
        executor.execute {
            val obsolete = listOf(
                "voice-model",
                "piper-model",
                "supertonic3-int8-v0",
                "supertonic3-int8-v1"
            )

            for (name in obsolete) {
                try {
                    File(app.filesDir, name).deleteRecursively()
                } catch (_: Throwable) {
                }
            }

            try {
                app.cacheDir.listFiles()?.forEach { it.deleteRecursively() }
            } catch (_: Throwable) {
            }
        }
    }

    /**
     * Start loading as soon as WhatsApp becomes foreground, not only after
     * the user taps a message. The first tiny silent inference primes ONNX
     * kernels so the first real message does not pay that startup cost.
     */
    fun enterWhatsApp(context: Context) {
        keepWarm.set(true)
        releaseHandler.removeCallbacks(releaseRunnable)
        warmUp(context)
    }

    fun leaveWhatsApp() {
        keepWarm.set(false)
        releaseHandler.removeCallbacks(releaseRunnable)
        releaseHandler.postDelayed(
            releaseRunnable,
            RELEASE_AFTER_LEAVING_WHATSAPP_MS
        )
    }

    fun releaseIfIdleNow() {
        if (speaking.get()) return
        keepWarm.set(false)
        releaseHandler.removeCallbacks(releaseRunnable)
        releaseHandler.post(releaseRunnable)
    }

    fun warmUp(
        context: Context,
        onReady: (() -> Unit)? = null,
        onError: ((Throwable) -> Unit)? = null
    ) {
        val existing = tts
        if (existing != null) {
            if (!primed && !speaking.get()) {
                executor.execute {
                    primeEngine(existing)
                    onReady?.invoke()
                }
            } else {
                onReady?.invoke()
            }
            return
        }

        synchronized(this) {
            if (tts != null) {
                onReady?.invoke()
                return
            }
            if (initializing) return
            initializing = true
        }

        val app = context.applicationContext
        executor.execute {
            try {
                val engine = createEngine(app)
                tts = engine
                initializing = false

                if (!speaking.get()) {
                    primeEngine(engine)
                }

                onReady?.invoke()
            } catch (t: Throwable) {
                initializing = false
                onError?.invoke(t)
            }
        }
    }

    fun speak(
        context: Context,
        rawText: String,
        sid: Int = VoiceSettings.getSid(context),
        onComplete: (() -> Unit)? = null,
        onError: ((Throwable) -> Unit)? = null
    ) {
        val normalized = PortugueseNormalizer.normalize(rawText)
        if (normalized.isBlank()) return

        releaseHandler.removeCallbacks(releaseRunnable)
        val myGeneration = generation.incrementAndGet()
        speaking.set(true)
        stopTrackOnly()

        val app = context.applicationContext

        executor.execute {
            var track: AudioTrack? = null

            try {
                if (tts == null) {
                    tts = createEngine(app)
                    primed = false
                }

                if (generation.get() != myGeneration) return@execute

                val engine = tts ?: return@execute
                val sampleRate = engine.sampleRate()
                val minBuffer = AudioTrack.getMinBufferSize(
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
                )

                track = AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    max(minBuffer, 8192),
                    AudioTrack.MODE_STREAM
                )

                currentTrack = track
                track.play()

                var framesWritten = 0L
                val chunks = splitLowLatency(normalized)

                for ((index, chunk) in chunks.withIndex()) {
                    if (generation.get() != myGeneration) break

                    val config = GenerationConfig(
                        silenceScale = 0.08f,
                        speed = DEFAULT_SPEED,
                        sid = sid.coerceIn(0, 9),
                        numSteps = if (index == 0) firstChunkSteps() else normalSteps(),
                        extra = mapOf("lang" to "pt")
                    )

                    engine.generateWithConfigAndCallback(
                        text = chunk,
                        config = config
                    ) { samples ->
                        if (generation.get() != myGeneration) {
                            0
                        } else {
                            primed = true
                            framesWritten += writeSamples(
                                track = track,
                                samples = samples,
                                generationId = myGeneration
                            )
                            if (generation.get() == myGeneration) 1 else 0
                        }
                    }
                }

                if (generation.get() == myGeneration) {
                    drainTrack(
                        track = track,
                        totalFrames = framesWritten,
                        sampleRate = sampleRate,
                        generationId = myGeneration
                    )
                }

                safeRelease(track)
                if (currentTrack === track) currentTrack = null

                if (generation.get() == myGeneration) {
                    speaking.set(false)
                    onComplete?.invoke()
                }
            } catch (t: Throwable) {
                safeRelease(track)
                if (currentTrack === track) currentTrack = null

                if (generation.get() == myGeneration) {
                    speaking.set(false)
                    onError?.invoke(t)
                }
            }
        }
    }

    fun isSpeaking(): Boolean = speaking.get()

    fun stop() {
        generation.incrementAndGet()
        speaking.set(false)
        stopTrackOnly()
    }

    private fun createEngine(context: Context): OfflineTts {
        val base = "model"

        val supertonic = OfflineTtsSupertonicModelConfig(
            durationPredictor = "$base/duration_predictor.int8.onnx",
            textEncoder = "$base/text_encoder.int8.onnx",
            vectorEstimator = "$base/vector_estimator.int8.onnx",
            vocoder = "$base/vocoder.int8.onnx",
            ttsJson = "$base/tts.json",
            unicodeIndexer = "$base/unicode_indexer.bin",
            voiceStyle = "$base/voice.bin"
        )

        val config = OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                supertonic = supertonic,
                numThreads = inferenceThreads(),
                debug = false,
                provider = "cpu"
            ),
            maxNumSentences = 1,
            silenceScale = 0.08f
        )

        return OfflineTts(
            assetManager = context.assets,
            config = config
        )
    }

    private fun primeEngine(engine: OfflineTts) {
        if (primed || speaking.get()) return

        try {
            engine.generateWithConfig(
                text = "oi",
                config = GenerationConfig(
                    silenceScale = 0.05f,
                    speed = DEFAULT_SPEED,
                    sid = 0,
                    numSteps = 1,
                    extra = mapOf("lang" to "pt")
                )
            )
            primed = true
        } catch (_: Throwable) {
            // Priming is only an optimization; normal speech can still proceed.
        }
    }

    private fun inferenceThreads(): Int {
        val available = Runtime.getRuntime().availableProcessors()
        return if (isLegacy32Bit()) {
            available.coerceIn(2, 3)
        } else {
            available.coerceIn(2, 4)
        }
    }

    private fun firstChunkSteps(): Int =
        if (isLegacy32Bit()) 2 else 3

    private fun normalSteps(): Int =
        if (isLegacy32Bit()) 3 else 4

    private fun isLegacy32Bit(): Boolean {
        return Build.VERSION.SDK_INT < 21 ||
            Build.SUPPORTED_64_BIT_ABIS.isEmpty()
    }

    private fun splitLowLatency(text: String): List<String> {
        val clean = text.trim()
        if (clean.length <= FIRST_CHUNK_MAX) return listOf(clean)

        val result = ArrayList<String>()
        val firstCut = chooseCut(
            text = clean,
            preferred = FIRST_CHUNK_TARGET,
            maximum = FIRST_CHUNK_MAX,
            minimum = 35
        )

        result.add(clean.substring(0, firstCut).trim())
        var remaining = clean.substring(firstCut).trim()

        while (remaining.length > NEXT_CHUNK_MAX) {
            val cut = chooseCut(
                text = remaining,
                preferred = NEXT_CHUNK_MAX,
                maximum = NEXT_CHUNK_MAX,
                minimum = 90
            )
            result.add(remaining.substring(0, cut).trim())
            remaining = remaining.substring(cut).trim()
        }

        if (remaining.isNotBlank()) result.add(remaining)
        return result.filter { it.isNotBlank() }
    }

    private fun chooseCut(
        text: String,
        preferred: Int,
        maximum: Int,
        minimum: Int
    ): Int {
        val max = maximum.coerceAtMost(text.length - 1)
        if (max <= minimum) return max.coerceAtLeast(1)

        val punctuation = charArrayOf('.', '?', '!', ';', ':', ',')
        for (i in max downTo minimum) {
            if (text[i] in punctuation) {
                return (i + 1).coerceAtMost(text.length)
            }
        }

        val preferredIndex = preferred.coerceAtMost(max)
        for (i in preferredIndex downTo minimum) {
            if (text[i].isWhitespace()) return i
        }

        for (i in max downTo minimum) {
            if (text[i].isWhitespace()) return i
        }

        return max
    }

    private fun writeSamples(
        track: AudioTrack,
        samples: FloatArray,
        generationId: Int
    ): Long {
        if (samples.isEmpty()) return 0L

        val bytes = floatToPcm16(samples)
        var offset = 0

        while (
            offset < bytes.size &&
            generation.get() == generationId
        ) {
            val wrote = try {
                track.write(bytes, offset, bytes.size - offset)
            } catch (_: Throwable) {
                -1
            }

            if (wrote <= 0) break
            offset += wrote
        }

        return (offset / 2).toLong()
    }

    private fun drainTrack(
        track: AudioTrack,
        totalFrames: Long,
        sampleRate: Int,
        generationId: Int
    ) {
        if (totalFrames <= 0L) return

        val initialHead = playbackHead(track)
        val remaining = (totalFrames - initialHead).coerceAtLeast(0L)
        val expectedMs =
            (remaining * 1000L / sampleRate.coerceAtLeast(1)) + 1000L
        val deadline =
            System.currentTimeMillis() + expectedMs.coerceAtMost(20_000L)

        while (
            generation.get() == generationId &&
            System.currentTimeMillis() < deadline
        ) {
            if (playbackHead(track) >= totalFrames) break
            try {
                Thread.sleep(10L)
            } catch (_: InterruptedException) {
                break
            }
        }

        if (generation.get() == generationId) {
            try {
                Thread.sleep(30L)
            } catch (_: InterruptedException) {
            }
        }
    }

    private fun playbackHead(track: AudioTrack): Long {
        return try {
            track.playbackHeadPosition.toLong() and 0xffffffffL
        } catch (_: Throwable) {
            0L
        }
    }

    private fun stopTrackOnly() {
        val track = currentTrack
        currentTrack = null
        safeRelease(track, immediate = true)
    }

    private fun safeRelease(
        track: AudioTrack?,
        immediate: Boolean = false
    ) {
        if (track == null) return

        if (immediate) {
            try {
                track.pause()
            } catch (_: Throwable) {
            }
            try {
                track.flush()
            } catch (_: Throwable) {
            }
        }

        try {
            track.stop()
        } catch (_: Throwable) {
        }
        try {
            track.release()
        } catch (_: Throwable) {
        }
    }

    private fun floatToPcm16(samples: FloatArray): ByteArray {
        val out = ByteArray(samples.size * 2)
        var index = 0

        for (sample in samples) {
            val value = (sample.coerceIn(-1f, 1f) * 32767f).toInt()
            out[index++] = (value and 0xff).toByte()
            out[index++] = ((value shr 8) and 0xff).toByte()
        }

        return out
    }
}
