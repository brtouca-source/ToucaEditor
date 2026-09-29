package com.toucabr.leitorfacil

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import kotlin.math.abs

object MessageExtractor {
    data class Candidate(
        val text: String,
        val bounds: Rect,
        val fromDescription: Boolean
    ) {
        fun stableKey(): String =
            text + "|" + bounds.left + "|" + bounds.top + "|" + bounds.right + "|" + bounds.bottom
    }

    private val timeRegex = Regex("^(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?[AaPp][Mm])?$")
    private val dateRegex = Regex(
        "^(hoje|ontem|segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)$",
        RegexOption.IGNORE_CASE
    )

    private val junkExact = setOf(
        "whatsapp", "conversas", "atualizações", "comunidades", "ligações",
        "pesquisar", "voltar", "mais opções", "enviar", "anexar",
        "câmera", "camera", "mensagem", "digite uma mensagem", "online",
        "chamada de voz", "chamada de vídeo", "videochamada", "nova conversa",
        "lida", "entregue", "enviando", "silenciado", "fixada"
    )

    fun atPoint(
        root: AccessibilityNodeInfo,
        x: Int,
        y: Int,
        screenHeight: Int,
        density: Float
    ): Candidate? {
        val all = collectCandidates(root, screenHeight, density)
        if (all.isEmpty()) return null

        val pad = (18f * density).toInt()
        val direct = all.filter {
            val r = Rect(it.bounds)
            r.inset(-pad, -pad)
            r.contains(x, y)
        }

        if (direct.isNotEmpty()) {
            return direct.minByOrNull {
                val area = it.bounds.width().coerceAtLeast(1) * it.bounds.height().coerceAtLeast(1)
                area + if (it.fromDescription) 100000 else 0
            }
        }

        val verticalTolerance = (46f * density).toInt()
        val horizontalTolerance = (90f * density).toInt()

        return all
            .map { candidate ->
                val r = candidate.bounds
                val dy = when {
                    y < r.top -> r.top - y
                    y > r.bottom -> y - r.bottom
                    else -> 0
                }
                val dx = when {
                    x < r.left -> r.left - x
                    x > r.right -> x - r.right
                    else -> 0
                }
                Triple(candidate, dx, dy)
            }
            .filter { (_, dx, dy) -> dy <= verticalTolerance && dx <= horizontalTolerance }
            .minByOrNull { (candidate, dx, dy) ->
                dy * 10 + dx + if (candidate.fromDescription) (30f * density).toInt() else 0
            }
            ?.first
    }

    fun nearest(
        root: AccessibilityNodeInfo,
        targetY: Int,
        screenHeight: Int,
        density: Float
    ): Candidate? {
        val all = collectCandidates(root, screenHeight, density)
        if (all.isEmpty()) return null
        val maxDistance = (260 * density).toInt()
        val nearest = all.minByOrNull {
            val center = (it.bounds.top + it.bounds.bottom) / 2
            var score = abs(center - targetY)
            if (it.fromDescription) score += (30 * density).toInt()
            score
        }
        if (nearest != null) {
            val center = (nearest.bounds.top + nearest.bounds.bottom) / 2
            if (abs(center - targetY) <= maxDistance) return nearest
        }
        return all.maxByOrNull { it.bounds.bottom }
    }

    private fun collectCandidates(
        root: AccessibilityNodeInfo,
        screenHeight: Int,
        density: Float
    ): List<Candidate> {
        val out = ArrayList<Candidate>()
        collect(root, out, screenHeight, density)
        return out.distinctBy { it.stableKey() }
    }

    private fun collect(
        node: AccessibilityNodeInfo?,
        out: MutableList<Candidate>,
        screenHeight: Int,
        density: Float
    ) {
        if (node == null) return

        try {
            val rect = Rect()
            node.getBoundsInScreen(rect)

            val headerCut = (76 * density).toInt()
            val bottomCut = screenHeight - (70 * density).toInt()

            if (
                rect.bottom > headerCut &&
                rect.top < bottomCut &&
                rect.width() > 0 &&
                rect.height() > 0
            ) {
                val text = node.text?.toString()?.trim().orEmpty()

                if (isUseful(text)) {
                    out.add(Candidate(text, Rect(rect), false))
                } else if (text.isBlank()) {
                    val desc = node.contentDescription?.toString()?.trim().orEmpty()
                    val mapped = mapDescription(desc)
                    if (isUseful(mapped)) {
                        out.add(Candidate(mapped, Rect(rect), true))
                    }
                }
            }

            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                if (child != null) {
                    collect(child, out, screenHeight, density)
                    try {
                        child.recycle()
                    } catch (_: Throwable) {
                    }
                }
            }
        } catch (_: Throwable) {
        }
    }

    private fun isUseful(value: String): Boolean {
        val s = value.trim()
        if (s.isBlank() || s.length > 1200) return false

        val low = s.lowercase()
        if (low in junkExact) return false
        if (timeRegex.matches(s) || dateRegex.matches(s)) return false
        if (low.startsWith("visto por último")) return false
        if (low.startsWith("toque e segure")) return false
        if (low.contains("criptografia de ponta a ponta")) return false
        if (low == "1 mensagem não lida" || low.endsWith(" mensagens não lidas")) return false
        if (low.endsWith(" não lida") || low.endsWith(" não lidas")) return false
        if (s.all { it.isDigit() || it in " .,:/-" }) return false

        return true
    }

    private fun mapDescription(desc: String): String {
        if (desc.isBlank()) return ""

        val low = desc.lowercase()
        return when {
            low.contains("mensagem de voz") || low.contains("áudio") || low.contains("audio") ->
                "Mensagem de áudio"
            low.contains("foto") || low.contains("imagem") ->
                "Imagem"
            low.contains("vídeo") || low.contains("video") ->
                "Vídeo"
            low.contains("figurinha") ->
                "Figurinha"
            low.contains("gif") ->
                "GIF"
            low.contains("documento") ->
                "Documento"
            else ->
                desc
        }
    }
}
