package com.toucabr.leitorfacil

import java.util.Locale

object PortugueseNormalizer {
    private val safeWords = mapOf(
        "vc" to "você",
        "vcs" to "vocês",
        "v6" to "vocês",
        "q" to "que",
        "pq" to "porque",
        "pk" to "porque",
        "tb" to "também",
        "tbm" to "também",
        "tmb" to "também",
        "blz" to "beleza",
        "vlw" to "valeu",
        "flw" to "falou",
        "obg" to "obrigado",
        "obgd" to "obrigado",
        "pfv" to "por favor",
        "pf" to "por favor",
        "agr" to "agora",
        "hj" to "hoje",
        "dps" to "depois",
        "msg" to "mensagem",
        "cmg" to "comigo",
        "ctg" to "contigo",
        "qnd" to "quando",
        "qdo" to "quando",
        "qnt" to "quanto",
        "nd" to "nada",
        "n" to "não",
        "ss" to "sim",
        "mds" to "meu Deus",
        "tmj" to "tamo junto",
        "pdc" to "pode crer",
        "sqn" to "só que não",
        "mn" to "mano",
        "dms" to "demais",
        "aq" to "aqui",
        "aki" to "aqui",
        "kd" to "cadê",
        "ctz" to "certeza",
        "certezaa" to "certeza",
        "bora" to "bora"
    )

    private val laughter = Regex(
        "(?i)(?:k{3,}|(?:ha){2,}|(?:he){2,}|(?:rs){2,}|rsrs+)"
    )

    private val urlOnly = Regex(
        "(?i)^\\s*(?:https?://|www\\.)\\S+\\s*$"
    )

    fun isPureUrl(text: String): Boolean = urlOnly.matches(text)

    fun normalize(input: String): String {
        if (input.isBlank()) return ""

        var text = input
            .replace('\u00A0', ' ')
            .replace(laughter, " risos ")

        // Do not read giant URLs aloud. When there is useful surrounding text,
        // keep only the fact that a link exists.
        text = text.replace(
            Regex("(?i)(?:https?://|www\\.)\\S+"),
            " link "
        )

        val tokenRegex = Regex("[\\p{L}\\p{N}_]+|[^\\p{L}\\p{N}_]+")
        val rebuilt = StringBuilder()

        for (match in tokenRegex.findAll(text)) {
            val token = match.value
            if (token.firstOrNull()?.isLetterOrDigit() == true) {
                val lower = token.lowercase(Locale("pt", "BR"))
                val replacement = safeWords[lower]
                if (replacement != null) {
                    rebuilt.append(matchCase(token, replacement))
                } else {
                    rebuilt.append(token)
                }
            } else {
                rebuilt.append(token)
            }
        }

        return improveProsody(rebuilt.toString())
    }

    private fun improveProsody(raw: String): String {
        var s = raw

        // Compress punctuation that often makes TTS stutter while preserving intent.
        s = s.replace(Regex("\\?{2,}"), "?")
        s = s.replace(Regex("!{2,}"), "!")
        s = s.replace(Regex("\\.{4,}"), "...")
        s = s.replace(Regex("[ \\t]+"), " ")
        s = s.replace(Regex(" *\\n+ *"), ". ")
        s = s.replace(Regex("\\s+([,.;!?])"), "$1")
        s = s.replace(Regex("([,.;!?])(?=\\p{L})"), "$1 ")
        s = s.replace(Regex("\\s{2,}"), " ").trim()

        // ALL CAPS short phrases often sound harsh. Keep the words, normalize casing.
        val letters = s.count { it.isLetter() }
        val upper = s.count { it.isUpperCase() }
        if (letters >= 4 && upper.toFloat() / letters.toFloat() > 0.80f && s.length < 120) {
            s = s.lowercase(Locale("pt", "BR"))
                .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale("pt", "BR")) else it.toString() }
        }

        return s
    }

    private fun matchCase(original: String, replacement: String): String {
        return when {
            original.all { !it.isLetter() || it.isUpperCase() } ->
                replacement.uppercase(Locale("pt", "BR"))
            original.firstOrNull()?.isUpperCase() == true ->
                replacement.replaceFirstChar {
                    if (it.isLowerCase()) it.titlecase(Locale("pt", "BR")) else it.toString()
                }
            else -> replacement
        }
    }
}
