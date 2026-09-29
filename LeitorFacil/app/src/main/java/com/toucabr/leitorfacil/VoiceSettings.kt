package com.toucabr.leitorfacil

import android.content.Context

object VoiceSettings {
    const val PREFS = "leitor_facil_settings"
    private const val KEY_VOICE_SID = "voice_sid"
    const val DEFAULT_SID = 0

    data class Preset(
        val sid: Int,
        val label: String,
        val sample: String
    )

    // Supertonic 3 voice.bin is packed in the built-in style order:
    // F1..F5 followed by M1..M5. We expose four simple presets.
    val presets = listOf(
        Preset(1, "Mulher jovem", "Oi! Esta é a voz feminina mais jovem e animada."),
        Preset(0, "Mulher adulta", "Olá. Esta é a voz feminina mais calma e natural."),
        Preset(5, "Homem jovem", "Oi! Esta é a voz masculina mais leve e animada."),
        Preset(6, "Homem adulto", "Olá. Esta é a voz masculina mais grave e calma.")
    )

    fun getSid(context: Context): Int {
        val stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(KEY_VOICE_SID, DEFAULT_SID)
        return stored.coerceIn(0, 9)
    }

    fun setSid(context: Context, sid: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(KEY_VOICE_SID, sid.coerceIn(0, 9))
            .apply()
    }
}
