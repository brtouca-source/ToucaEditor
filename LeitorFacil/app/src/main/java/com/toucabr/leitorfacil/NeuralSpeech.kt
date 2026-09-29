package com.toucabr.leitorfacil

import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max

object NeuralSpeech {
    private val executor = Executors.newSingleThreadExecutor()
    private val generation = AtomicInteger(0)
    private val speaking = AtomicBoolean(false)

    @Volatile private var tts: OfflineTts? = null
    @Volatile private var initializing = false
    @Volatile private var currentTrack: AudioTrack? = null

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
        speed: Float = 1.0f,
        onComplete: (() -> Unit)? = null,
        onError: ((Throwable) -> Unit)? = null
    ) {
        val text = normalize(rawText)
        if (text.isBlank()) return

        val requestedSpeed = speed.coerceIn(0.8f, 2.0f)
        val myGeneration = generation.incrementAndGet()
        speaking.set(true)
        stopTrack()

        executor.execute {
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

                val track = AudioTrack(
                    AudioManager.STREAM_MUSIC,
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    max(minBuffer, 8192),
                    AudioTrack.MODE_STREAM
                )

                currentTrack = track
                track.play()

                val config = GenerationConfig(
                    silenceScale = 0.16f,
                    speed = requestedSpeed,
                    sid = 0
                )

                engine.generateWithConfigAndCallback(text, config) { samples ->
                    if (generation.get() != myGeneration) {
                        0
                    } else {
                        val bytes = floatToPcm16(samples)
                        var offset = 0

                        while (
                            offset < bytes.size &&
                            generation.get() == myGeneration
                        ) {
                            val wrote = try {
                                track.write(bytes, offset, bytes.size - offset)
                            } catch (_: Throwable) {
                                -1
                            }

                            if (wrote <= 0) break
                            offset += wrote
                        }

                        if (generation.get() == myGeneration) 1 else 0
                    }
                }

                if (generation.get() == myGeneration) {
                    try {
                        track.stop()
                    } catch (_: Throwable) {
                    }
                }

                try {
                    track.release()
                } catch (_: Throwable) {
                }

                if (currentTrack === track) {
                    currentTrack = null
                }

                if (generation.get() == myGeneration) {
                    speaking.set(false)
                    onComplete?.invoke()
                }
            } catch (t: Throwable) {
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
        stopTrack()
    }

    private fun createEngine(context: Context): OfflineTts {
        val dir = ensureModel(context)

        val vits = OfflineTtsVitsModelConfig(
            model = File(dir, "pt_BR-edresson-low.onnx").absolutePath,
            tokens = File(dir, "tokens.txt").absolutePath,
            dataDir = File(dir, "espeak-ng-data").absolutePath,
            noiseScale = 0.55f,
            noiseScaleW = 0.70f,
            lengthScale = 1.0f
        )

        val model = OfflineTtsModelConfig(
            vits = vits,
            numThreads = 2,
            debug = false,
            provider = "cpu"
        )

        return OfflineTts(
            config = OfflineTtsConfig(
                model = model,
                maxNumSentences = 1,
                silenceScale = 0.16f
            )
        )
    }

    private fun stopTrack() {
        val track = currentTrack
        currentTrack = null

        if (track != null) {
            try {
                track.pause()
            } catch (_: Throwable) {
            }

            try {
                track.flush()
            } catch (_: Throwable) {
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
    }

    private fun floatToPcm16(samples: FloatArray): ByteArray {
        val out = ByteArray(samples.size * 2)
        var j = 0

        for (sample in samples) {
            val s = (sample.coerceIn(-1f, 1f) * 32767f).toInt()
            out[j++] = (s and 0xff).toByte()
            out[j++] = ((s shr 8) and 0xff).toByte()
        }

        return out
    }

    private fun normalize(input: String): String {
        var s = input.trim()

        s = s.replace(
            Regex("https?://\\S+", RegexOption.IGNORE_CASE),
            " link "
        )

        s = s
            .replace("😂", " risada ")
            .replace("🤣", " risada ")
            .replace("❤️", " coração ")
            .replace("❤", " coração ")
            .replace("👍", " joinha ")
            .replace("🙏", " mãos juntas ")
            .replace("😍", " apaixonado ")
            .replace("😭", " chorando ")
            .replace("😊", " sorriso ")
            .replace("🔥", " fogo ")

        s = s.replace(Regex("\\s+"), " ").trim()

        return if (s.length > 600) {
            s.take(600) + ". Mensagem muito longa."
        } else {
            s
        }
    }

    private fun ensureModel(context: Context): File {
        val outDir = File(context.filesDir, "voice-model")
        val marker = File(outDir, ".ready")

        if (marker.exists()) return outDir

        if (outDir.exists()) {
            outDir.deleteRecursively()
        }

        outDir.mkdirs()
        copyAssetTree(context, "model", outDir)
        marker.writeText("ok")
        return outDir
    }

    private fun copyAssetTree(
        context: Context,
        assetPath: String,
        dest: File
    ) {
        val list = context.assets.list(assetPath) ?: emptyArray()

        if (list.isEmpty()) {
            dest.parentFile?.mkdirs()

            context.assets.open(assetPath).use { input ->
                FileOutputStream(dest).use { output ->
                    input.copyTo(output, 1024 * 256)
                }
            }
            return
        }

        dest.mkdirs()

        for (name in list) {
            copyAssetTree(
                context,
                assetPath + "/" + name,
                File(dest, name)
            )
        }
    }
}
