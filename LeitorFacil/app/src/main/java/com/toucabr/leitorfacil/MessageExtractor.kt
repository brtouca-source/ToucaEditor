package com.toucabr.leitorfacil

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import kotlin.math.abs

object MessageExtractor {
    data class Candidate(val text: String, val bounds: Rect, val fromDescription: Boolean)

    private val timeRegex = Regex("^(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?[AaPp][Mm])?$")
    private val dateRegex = Regex("^(hoje|ontem|segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)$", RegexOption.IGNORE_CASE)
    private val junkExact = setOf(
        "whatsapp", "conversas", "atualizações", "comunidades", "ligações", "pesquisar", "voltar",
        "mais opções", "enviar", "anexar", "câmera", "camera", "mensagem", "digite uma mensagem",
        "online", "chamada de voz", "chamada de vídeo", "videochamada", "nova conversa"
    )

    fun nearest(root: AccessibilityNodeInfo, targetY: Int, screenHeight: Int, density: Float): Candidate? {
        val all = ArrayList<Candidate>()
        collect(root, all, screenHeight, density)
        if (all.isEmpty()) return null

        val deduped = all.distinctBy { "${it.bounds.left}:${it.bounds.top}:${it.bounds.right}:${it.bounds.bottom}:${it.text}" }
        val maxDistance = (260 * density).toInt()
        val nearest = deduped.minByOrNull {
            val center = (it.bounds.top + it.bounds.bottom) / 2
            var score = abs(center - targetY)
            if (it.fromDescription) score += (30 * density).toInt()
            score
        }
        if (nearest != null) {
            val center = (nearest.bounds.top + nearest.bounds.bottom) / 2
            if (abs(center - targetY) <= maxDistance) return nearest
        }
        return deduped.maxByOrNull { it.bounds.bottom }
    }

    private fun collect(node: AccessibilityNodeInfo?, out: MutableList<Candidate>, screenHeight: Int, density: Float) {
        if (node == null) return
        try {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            val headerCut = (74 * density).toInt()
            val bottomCut = screenHeight - (82 * density).toInt()

            if (rect.bottom > headerCut && rect.top < bottomCut && rect.height() > 0) {
                val text = node.text?.toString()?.trim().orEmpty()
                if (isUseful(text)) out.add(Candidate(text, Rect(rect), false))
                if (text.isBlank()) {
                    val desc = node.contentDescription?.toString()?.trim().orEmpty()
                    val mapped = mapDescription(desc)
                    if (isUseful(mapped)) out.add(Candidate(mapped, Rect(rect), true))
                }
            }

            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                if (child != null) {
                    collect(child, out, screenHeight, density)
                    child.recycle()
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
        if (s.all { it.isDigit() || it in " .,:/-" }) return false
        return true
    }

    private fun mapDescription(desc: String): String {
        if (desc.isBlank()) return ""
        val low = desc.lowercase()
        return when {
            low.contains("mensagem de voz") || low.contains("áudio") || low.contains("audio") -> "Mensagem de áudio"
            low.contains("foto") || low.contains("imagem") -> "Imagem"
            low.contains("vídeo") || low.contains("video") -> "Vídeo"
            low.contains("figurinha") -> "Figurinha"
            low.contains("gif") -> "GIF"
            low.contains("documento") -> "Documento"
            else -> desc
        }
    }
}
