package com.toucabr.leitorfacil

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo

object MessageExtractor {
    data class Candidate(
        val text: String,
        val textBounds: Rect,
        val bubbleBounds: Rect
    ) {
        fun stableKey(): String =
            text + "|" +
                bubbleBounds.left + "|" +
                bubbleBounds.top + "|" +
                bubbleBounds.right + "|" +
                bubbleBounds.bottom
    }

    private val timeRegex = Regex(
        "^(?:[01]?\\d|2[0-3]):[0-5]\\d(?:\\s?[AaPp][Mm])?$"
    )

    private val dateRegex = Regex(
        "^(hoje|ontem|segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|" +
            "quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|" +
            "\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)$",
        RegexOption.IGNORE_CASE
    )

    private val junkExact = setOf(
        "whatsapp", "conversas", "atualizações", "comunidades", "ligações",
        "pesquisar", "voltar", "mais opções", "enviar", "anexar",
        "câmera", "camera", "mensagem", "digite uma mensagem", "online",
        "chamada de voz", "chamada de vídeo", "videochamada", "nova conversa",
        "lida", "entregue", "enviando", "silenciado", "fixada",
        "responder", "encaminhar", "copiar", "apagar", "favoritar"
    )

    fun visibleMessages(
        root: AccessibilityNodeInfo,
        screenWidth: Int,
        screenHeight: Int,
        density: Float
    ): List<Candidate> {
        val out = ArrayList<Candidate>()
        collect(
            node = root,
            out = out,
            screenWidth = screenWidth,
            screenHeight = screenHeight,
            density = density
        )

        return out
            .distinctBy { it.stableKey() }
            .filter {
                it.textBounds.width() > 0 &&
                    it.textBounds.height() > 0 &&
                    it.bubbleBounds.width() > 0 &&
                    it.bubbleBounds.height() > 0
            }
    }

    private fun collect(
        node: AccessibilityNodeInfo?,
        out: MutableList<Candidate>,
        screenWidth: Int,
        screenHeight: Int,
        density: Float
    ) {
        if (node == null) return

        try {
            val rect = Rect()
            node.getBoundsInScreen(rect)

            val headerCut = (72 * density).toInt()
            val bottomCut = screenHeight - (68 * density).toInt()

            if (
                rect.bottom > headerCut &&
                rect.top < bottomCut &&
                rect.width() > 0 &&
                rect.height() > 0
            ) {
                val text = node.text?.toString()?.trim().orEmpty()

                if (isUsefulText(text)) {
                    val bubble = findBubbleBounds(
                        node,
                        rect,
                        screenWidth,
                        screenHeight,
                        density
                    )

                    val safeBubble = Rect(
                        bubble.left.coerceAtLeast(0),
                        bubble.top.coerceAtLeast(headerCut),
                        bubble.right.coerceAtMost(screenWidth),
                        bubble.bottom.coerceAtMost(bottomCut)
                    )

                    if (
                        safeBubble.width() > 0 &&
                        safeBubble.height() > 0
                    ) {
                        out.add(
                            Candidate(
                                text = text,
                                textBounds = Rect(rect),
                                bubbleBounds = safeBubble
                            )
                        )
                    }
                }
            }

            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                if (child != null) {
                    collect(
                        child,
                        out,
                        screenWidth,
                        screenHeight,
                        density
                    )
                    try {
                        child.recycle()
                    } catch (_: Throwable) {
                    }
                }
            }
        } catch (_: Throwable) {
        }
    }

    private fun findBubbleBounds(
        node: AccessibilityNodeInfo,
        textBounds: Rect,
        screenWidth: Int,
        screenHeight: Int,
        density: Float
    ): Rect {
        var best = Rect(textBounds)
        var current: AccessibilityNodeInfo? = null

        try {
            current = node.parent
            var depth = 0

            while (current != null && depth < 5) {
                val bounds = Rect()
                current.getBoundsInScreen(bounds)

                val fullWidth = bounds.width() >= (screenWidth * 0.93f).toInt()
                val tooTall = bounds.height() >= (screenHeight * 0.62f).toInt()
                val containsText = bounds.contains(textBounds)

                if (!containsText || fullWidth || tooTall) {
                    break
                }

                val horizontalPadding =
                    bounds.width() - textBounds.width()
                val verticalPadding =
                    bounds.height() - textBounds.height()

                val looksLikeBubble =
                    horizontalPadding <= (96 * density).toInt() &&
                    verticalPadding <= (120 * density).toInt() &&
                    bounds.width() <= (screenWidth * 0.90f).toInt()

                if (looksLikeBubble) {
                    best = Rect(bounds)
                }

                val next = current.parent
                try {
                    current.recycle()
                } catch (_: Throwable) {
                }
                current = next
                depth++
            }
        } catch (_: Throwable) {
        } finally {
            try {
                current?.recycle()
            } catch (_: Throwable) {
            }
        }

        // If WhatsApp exposes only the TextView, add a small visual/touch margin.
        if (best == textBounds) {
            val h = (8 * density).toInt()
            val v = (7 * density).toInt()
            best.inset(-h, -v)
        }

        return best
    }

    private fun isUsefulText(value: String): Boolean {
        val text = value.trim()
        if (text.isBlank() || text.length > 20_000) return false
        if (PortugueseNormalizer.isPureUrl(text)) return false

        val low = text.lowercase()
        if (low in junkExact) return false
        if (timeRegex.matches(text) || dateRegex.matches(text)) return false
        if (low.startsWith("visto por último")) return false
        if (low.startsWith("toque e segure")) return false
        if (low.contains("criptografia de ponta a ponta")) return false
        if (low == "1 mensagem não lida" || low.endsWith(" mensagens não lidas")) return false
        if (low.endsWith(" não lida") || low.endsWith(" não lidas")) return false
        if (text.all { it.isDigit() || it in " .,:/-" }) return false

        return true
    }
}
