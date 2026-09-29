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
        if (value < 100L) {
            val tens = when ((value / 10L).toInt()) {
                2 -> "vinte"; 3 -> "trinta"; 4 -> "quarenta"; 5 -> "cinquenta"
                6 -> "sessenta"; 7 -> "setenta"; 8 -> "oitenta"; else -> "noventa"
            }
            val rest = (value % 10L).toInt()
            return if (rest == 0) tens else tens + " e " + digitWords[rest]
        }
        if (value < 1000L) {
            if (value == 100L) return "cem"
            val hundreds = when ((value / 100L).toInt()) {
                1 -> "cento"; 2 -> "duzentos"; 3 -> "trezentos"; 4 -> "quatrocentos"
                5 -> "quinhentos"; 6 -> "seiscentos"; 7 -> "setecentos"
                8 -> "oitocentos"; else -> "novecentos"
            }
            val rest = value % 100L
            return if (rest == 0L) hundreds else hundreds + " e " + fallback(rest)
        }
        if (value < 1_000_000L) return scaled(value, 1_000L, "mil", "mil")
        if (value < 1_000_000_000L) return scaled(value, 1_000_000L, "milhão", "milhões")
        if (value < 1_000_000_000_000L) return scaled(value, 1_000_000_000L, "bilhão", "bilhões")
        if (value < 1_000_000_000_000_000L) return scaled(value, 1_000_000_000_000L, "trilhão", "trilhões")
        return value.toString()
    }

    private fun scaled(value: Long, base: Long, singular: String, plural: String): String {
        val high = value / base
        val rest = value % base
        val prefix = when {
            base == 1_000L && high == 1L -> "mil"
            high == 1L -> "um " + singular
            else -> fallback(high) + " " + plural
        }
        if (rest == 0L) return prefix
        val connector = if (rest < 100L || rest % 100L == 0L) " e " else " "
        return prefix + connector + fallback(rest)
    }
}
