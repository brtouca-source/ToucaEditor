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
import java.io.FileOutputStream
import java.text.BreakIterator
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max

object NeuralSpeech {
    private const val DEFAULT_SPEED = 1.25f
    private const val IDLE_RELEASE_MS = 75_000L
    private const val LEAVE_CHAT_RELEASE_MS = 12_000L

    private val executor = Executors.newSingleThreadExecutor()
    private val generation = AtomicInteger(0)
    private val speaking = AtomicBoolean(false)
    private val keepWarm = AtomicBoolean(false)
    private val releaseHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var tts: OfflineTts? = null

    @Volatile
    private var initializing = false

    @Volatile
    private var currentTrack: AudioTrack? = null

    private val releaseRunnable = Runnable {
        executor.execute {
            if (!speaking.get() && !keepWarm.get()) {
                try {
                    tts?.release()
                } catch (_: Throwable) {
                }
                tts = null
            }
        }
    }

    /**
     * Copies the embedded model out of the APK while the user is still in the
     * app. It does not start the neural engine and does not play anything.
     * This removes a large first-use delay from the first WhatsApp message.
     */
    fun prepareModelFiles(context: Context) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                cleanupObsoleteStorage(appContext)
                ensureModel(appContext)
            } catch (_: Throwable) {
            }
        }
    }

    /**
     * An open conversation is the only place where low-latency speech matters.
     * Keep the model resident while the user remains in that chat so every tap
     * after the first one starts much faster.
     */
    fun enterConversation(context: Context) {
        keepWarm.set(true)
        releaseHandler.removeCallbacks(releaseRunnable)
        warmUp(context)
    }

    fun leaveConversation() {
        keepWarm.set(false)
        scheduleIdleRelease(LEAVE_CHAT_RELEASE_MS)
    }

    fun warmUp(
        context: Context,
        onReady: (() -> Unit)? = null,
        onError: ((Throwable) -> Unit)? = null
    ) {
        if (tts != null) {
            onReady?.invoke()
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

        executor.execute {
            try {
                tts = createEngine(context.applicationContext)
                initializing = false
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

        executor.execute {
            var track: AudioTrack? = null

            try {
                if (tts == null) {
                    tts = createEngine(context.applicationContext)
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
                    max(minBuffer * 2, 16384),
                    AudioTrack.MODE_STREAM
                )

                currentTrack = track
                track.play()

                var framesWritten = 0L

                val config = GenerationConfig(
                    silenceScale = 0.10f,
                    speed = DEFAULT_SPEED,
                    sid = sid.coerceIn(0, 9),
                    // Sherpa's Supertonic default is 5. The previous modern-device
                    // path used up to 8, which costs extra generation time. Five
                    // keeps the voice quality while prioritizing response speed.
                    numSteps = 5,
                    extra = mapOf("lang" to "pt")
                )

                val chunks = splitForSpeech(normalized)

                for (chunk in chunks) {
                    if (generation.get() != myGeneration) break

                    engine.generateWithConfigAndCallback(
                        text = chunk,
                        config = config
                    ) { samples ->
                        if (generation.get() != myGeneration) {
                            0
                        } else {
                            val writtenFrames = writeSamples(
                                track = track,
                                samples = samples,
                                generationId = myGeneration
                            )
                            framesWritten += writtenFrames

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
                    scheduleIdleRelease()
                    onComplete?.invoke()
                }
            } catch (t: Throwable) {
                safeRelease(track)
                if (currentTrack === track) currentTrack = null

                if (generation.get() == myGeneration) {
                    speaking.set(false)
                    scheduleIdleRelease()
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
        scheduleIdleRelease()
    }

    private fun scheduleIdleRelease(
        delayMs: Long = IDLE_RELEASE_MS
    ) {
        releaseHandler.removeCallbacks(releaseRunnable)

        if (keepWarm.get()) return

        releaseHandler.postDelayed(
            releaseRunnable,
            delayMs
        )
    }

    private fun createEngine(context: Context): OfflineTts {
        val dir = ensureModel(context)

        val supertonic = OfflineTtsSupertonicModelConfig(
            durationPredictor = File(
                dir,
                "duration_predictor.int8.onnx"
            ).absolutePath,
            textEncoder = File(
                dir,
                "text_encoder.int8.onnx"
            ).absolutePath,
            vectorEstimator = File(
                dir,
                "vector_estimator.int8.onnx"
            ).absolutePath,
            vocoder = File(
                dir,
                "vocoder.int8.onnx"
            ).absolutePath,
            ttsJson = File(
                dir,
                "tts.json"
            ).absolutePath,
            unicodeIndexer = File(
                dir,
                "unicode_indexer.bin"
            ).absolutePath,
            voiceStyle = File(
                dir,
                "voice.bin"
            ).absolutePath
        )

        return OfflineTts(
            config = OfflineTtsConfig(
                model = OfflineTtsModelConfig(
                    supertonic = supertonic,
                    numThreads = if (isLegacy32Bit()) 2 else 3,
                    debug = false,
                    provider = "cpu"
                ),
                maxNumSentences = 1,
                silenceScale = 0.10f
            )
        )
    }

    private fun isLegacy32Bit(): Boolean {
        return Build.VERSION.SDK_INT < 21 ||
            Build.SUPPORTED_64_BIT_ABIS.isEmpty()
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
                track.write(
                    bytes,
                    offset,
                    bytes.size - offset
                )
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

        val startedAt = System.currentTimeMillis()
        val initialHead = playbackHead(track)
        val remaining = (totalFrames - initialHead).coerceAtLeast(0L)

        val expectedMs = (
            remaining * 1000L /
                sampleRate.coerceAtLeast(1)
            ) + 1400L

        val deadline = startedAt +
            expectedMs.coerceAtMost(20_000L)

        while (
            generation.get() == generationId &&
            System.currentTimeMillis() < deadline
        ) {
            if (playbackHead(track) >= totalFrames) break

            try {
                Thread.sleep(12L)
            } catch (_: InterruptedException) {
                break
            }
        }

        if (generation.get() == generationId) {
            try {
                Thread.sleep(35L)
            } catch (_: InterruptedException) {
            }
        }
    }

    private fun playbackHead(track: AudioTrack): Long {
        return try {
            track.playbackHeadPosition.toLong() and
                0xffffffffL
        } catch (_: Throwable) {
            0L
        }
    }

    private fun stopTrackOnly() {
        val track = currentTrack
        currentTrack = null
        safeRelease(
            track = track,
            immediate = true
        )
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

    private fun floatToPcm16(
        samples: FloatArray
    ): ByteArray {
        val out = ByteArray(samples.size * 2)
        var index = 0

        for (sample in samples) {
            val value = (
                sample.coerceIn(-1f, 1f) * 32767f
                ).toInt()

            out[index++] =
                (value and 0xff).toByte()
            out[index++] =
                ((value shr 8) and 0xff).toByte()
        }

        return out
    }

    private fun splitForSpeech(
        text: String,
        maxChars: Int = 760
    ): List<String> {
        if (text.length <= maxChars) {
            return listOf(text)
        }

        val locale = Locale("pt", "BR")
        val iterator =
            BreakIterator.getSentenceInstance(locale)

        iterator.setText(text)

        val sentences = ArrayList<String>()
        var start = iterator.first()
        var end = iterator.next()

        while (end != BreakIterator.DONE) {
            val sentence =
                text.substring(start, end).trim()

            if (sentence.isNotBlank()) {
                sentences.add(sentence)
            }

            start = end
            end = iterator.next()
        }

        if (sentences.isEmpty()) {
            return splitOversized(
                text,
                maxChars
            )
        }

        val result = ArrayList<String>()
        val current = StringBuilder()

        for (sentence in sentences) {
            if (sentence.length > maxChars) {
                if (current.isNotEmpty()) {
                    result.add(
                        current.toString().trim()
                    )
                    current.clear()
                }

                result.addAll(
                    splitOversized(
                        sentence,
                        maxChars
                    )
                )
                continue
            }

            if (
                current.isNotEmpty() &&
                current.length +
                    1 +
                    sentence.length > maxChars
            ) {
                result.add(
                    current.toString().trim()
                )
                current.clear()
            }

            if (current.isNotEmpty()) {
                current.append(' ')
            }

            current.append(sentence)
        }

        if (current.isNotEmpty()) {
            result.add(
                current.toString().trim()
            )
        }

        return result.filter {
            it.isNotBlank()
        }
    }

    private fun splitOversized(
        text: String,
        maxChars: Int
    ): List<String> {
        val result = ArrayList<String>()
        var remaining = text.trim()

        while (remaining.length > maxChars) {
            var cut =
                remaining.lastIndexOf(
                    ' ',
                    maxChars
                )

            if (cut < maxChars / 2) {
                cut = maxChars
            }

            result.add(
                remaining.substring(
                    0,
                    cut
                ).trim()
            )

            remaining =
                remaining.substring(cut).trim()
        }

        if (remaining.isNotBlank()) {
            result.add(remaining)
        }

        return result
    }

    private fun cleanupObsoleteStorage(context: Context) {
        val obsolete = listOf(
            "voice-model",
            "piper-model",
            "supertonic3-int8-v0"
        )

        for (name in obsolete) {
            try {
                File(context.filesDir, name).deleteRecursively()
            } catch (_: Throwable) {
            }
        }

        try {
            context.cacheDir.listFiles()?.forEach { file ->
                file.deleteRecursively()
            }
        } catch (_: Throwable) {
        }
    }

    private fun ensureModel(context: Context): File {
        val outDir = File(
            context.filesDir,
            "supertonic3-int8-v1"
        )
        val marker = File(
            outDir,
            ".ready"
        )

        if (marker.exists()) {
            return outDir
        }

        if (outDir.exists()) {
            outDir.deleteRecursively()
        }

        outDir.mkdirs()

        copyAssetTree(
            context = context,
            assetPath = "model",
            dest = outDir
        )

        val required = listOf(
            "duration_predictor.int8.onnx",
            "text_encoder.int8.onnx",
            "vector_estimator.int8.onnx",
            "vocoder.int8.onnx",
            "tts.json",
            "unicode_indexer.bin",
            "voice.bin"
        )

        for (name in required) {
            check(File(outDir, name).isFile) {
                "Modelo de voz incompleto: $name"
            }
        }

        marker.writeText("ok")
        return outDir
    }

    private fun copyAssetTree(
        context: Context,
        assetPath: String,
        dest: File
    ) {
        val list =
            context.assets.list(assetPath)
                ?: emptyArray()

        if (list.isEmpty()) {
            dest.parentFile?.mkdirs()

            context.assets
                .open(assetPath)
                .use { input ->
                    FileOutputStream(dest).use {
                            output ->
                        input.copyTo(
                            output,
                            1024 * 256
                        )
                    }
                }

            return
        }

        dest.mkdirs()

        for (name in list) {
            copyAssetTree(
                context = context,
                assetPath =
                    assetPath + "/" + name,
                dest = File(dest, name)
            )
        }
    }
}
