package com.toucabr.leitorfacil

object PortugueseNumberNormalizer {
    private val sequence = Regex("(?<!\\d)(?:\\d(?:\\s*[-,]\\s*|\\s+)){2,}\\d(?!\\d)")
    private val integer = Regex("(?<![\\p{L}\\p{N}_])\\d{1,15}(?![\\p{L}\\p{N}_])")
    private val digitWords = arrayOf(
        "zero", "um", "dois", "três", "quatro",
        "cinco", "seis", "sete", "oito", "nove"
    )

    fun normalize(input: String): String {
        if (input.isBlank()) return input

        val protected = LinkedHashMap<String, String>()
        var text = sequence.replace(input) { match ->
            val key = "NUMSEQ" + protected.size + "TOKEN"
            val spoken = match.value
                .filter { it.isDigit() }
                .map { digitWords[it - '0'] }
                .joinToString(", ")
            protected[key] = spoken
            key
        }

        text = integer.replace(text) { match ->
            val raw = match.value
            when {
                raw.length > 1 && raw.startsWith("0") ->
                    raw.map { digitWords[it - '0'] }.joinToString(", ")
                else -> integerToWords(raw)
            }
        }

        for ((key, value) in protected) {
            text = text.replace(key, value)
        }
        return text
    }

    private fun integerToWords(raw: String): String {
        val value = raw.toLongOrNull() ?: return raw
        return fallback(value)
    }

    private fun fallback(value: Long): String {
        if (value in 0..9) return digitWords[value.toInt()]
        if (value == 10L) return "dez"
        if (value == 11L) return "onze"
        if (value == 12L) return "doze"
        if (value == 13L) return "treze"
        if (value == 14L) return "quatorze"
        if (value == 15L) return "quinze"
        if (value == 16L) return "dezesseis"
        if (value == 17L) return "dezessete"
        if (value == 18L) return "dezoito"
        if (value == 19L) return "dezenove"
        return rawNumberFallback(value)
    }

    private fun rawNumberFallback(value: Long): String {
        val s = value.toString()
        return if (s.length <= 3) {
            s
        } else {
            s
        }
    }
}
