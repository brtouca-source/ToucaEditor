package com.toucabr.leitorfacil

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var voiceGroup: RadioGroup
    private val voiceIdToSid = HashMap<Int, Int>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val scroll = ScrollView(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(18), dp(20), dp(28))
            setBackgroundColor(Color.rgb(244, 247, 246))
        }
        scroll.addView(root)

        root.addView(TextView(this).apply {
            text = "🔊"
            textSize = 54f
            gravity = Gravity.CENTER
        }, full())

        root.addView(TextView(this).apply {
            text = "Leitor Fácil"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(20, 36, 32))
            gravity = Gravity.CENTER
        }, full())

        root.addView(TextView(this).apply {
            text = "Toque em uma mensagem de texto no WhatsApp para ouvi-la."
            textSize = 17f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(12))
        }, full())

        status = TextView(this).apply {
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(10), dp(10), dp(10))
        }
        root.addView(status, full())

        if (Build.VERSION.SDK_INT >= 33) {
            root.addView(Button(this).apply {
                text = "1. LIBERAR ACESSO DO ANDROID"
                textSize = 17f
                minHeight = dp(58)
                setOnClickListener {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:" + packageName)
                    })
                }
            }, full())
            root.addView(space(dp(8)))
        }

        root.addView(Button(this).apply {
            text = if (Build.VERSION.SDK_INT >= 33) "2. ATIVAR LEITOR" else "ATIVAR LEITOR"
            textSize = 19f
            setTypeface(typeface, Typeface.BOLD)
            minHeight = dp(64)
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }, full())

        root.addView(TextView(this).apply {
            text = "VOZ"
            textSize = 17f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(35, 55, 50))
            gravity = Gravity.CENTER
            setPadding(0, dp(22), 0, dp(6))
        }, full())

        voiceGroup = RadioGroup(this).apply {
            orientation = RadioGroup.VERTICAL
        }

        val selectedSid = VoiceSettings.getSid(this)
        for (preset in VoiceSettings.presets) {
            val button = RadioButton(this).apply {
                id = View.generateViewId()
                text = preset.label
                textSize = 18f
                setPadding(dp(8), dp(7), dp(8), dp(7))
                isChecked = preset.sid == selectedSid
            }
            voiceIdToSid[button.id] = preset.sid
            voiceGroup.addView(button, full())
        }

        voiceGroup.setOnCheckedChangeListener { _, checkedId ->
            val sid = voiceIdToSid[checkedId] ?: return@setOnCheckedChangeListener
            VoiceSettings.setSid(this, sid)
        }
        root.addView(voiceGroup, full())

        root.addView(Button(this).apply {
            text = "▶ OUVIR VOZ ESCOLHIDA"
            textSize = 17f
            minHeight = dp(58)
            setOnClickListener {
                val sid = VoiceSettings.getSid(this@MainActivity)
                val preset = VoiceSettings.presets.firstOrNull { it.sid == sid }
                val sample = preset?.sample ?: "Olá. Esta é a voz escolhida para ler suas mensagens."
                isEnabled = false
                text = "PREPARANDO VOZ..."
                NeuralSpeech.speak(
                    this@MainActivity,
                    sample,
                    sid = sid,
                    onComplete = {
                        runOnUiThread {
                            isEnabled = true
                            text = "▶ OUVIR VOZ ESCOLHIDA"
                        }
                    },
                    onError = {
                        runOnUiThread {
                            isEnabled = true
                            text = "▶ OUVIR VOZ ESCOLHIDA"
                            Toast.makeText(
                                this@MainActivity,
                                "Não foi possível gerar a voz.",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                )
            }
        }, full())

        root.addView(TextView(this).apply {
            text = "Uso: toque em texto para ler. Toque novamente na mesma mensagem para parar. Segurar, rolar, copiar e encaminhar continuam sendo funções do WhatsApp. Fotos, áudios, vídeos e arquivos não são lidos."
            textSize = 15f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(18), 0, 0)
        }, full())

        setContentView(scroll)

        // v3.3 uses the neural model directly from APK assets.
        // Remove only legacy copied models/cache left by older versions.
        NeuralSpeech.prepareStorage(this)
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) {
            val enabled = isReaderEnabled(this)
            status.text = if (enabled) "✓ LEITOR ATIVADO" else "○ LEITOR DESATIVADO"
            status.setTextColor(
                if (enabled) Color.rgb(7, 94, 84)
                else Color.rgb(160, 45, 45)
            )
        }
    }

    private fun isReaderEnabled(context: Context): Boolean {
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val component = packageName + "/" + WhatsAppReaderService::class.java.name
        return enabled.split(':').any { it.equals(component, ignoreCase = true) }
    }

    private fun full() = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    )

    private fun space(height: Int): View = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(1, height)
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}
