package com.toucabr.leitorfacil

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = dp(22)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.rgb(244, 247, 246))
        }

        val icon = TextView(this).apply {
            text = "🔊"
            textSize = 62f
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(8))
        }
        val title = TextView(this).apply {
            text = "Leitor Fácil"
            textSize = 28f
            setTextColor(Color.rgb(19, 35, 31))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        val subtitle = TextView(this).apply {
            text = "Lê mensagens do WhatsApp em voz alta. Funciona sem internet."
            textSize = 18f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(18))
        }
        status = TextView(this).apply {
            textSize = 19f
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val activate = Button(this).apply {
            text = "ATIVAR LEITOR"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
            minHeight = dp(72)
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }
        val test = Button(this).apply {
            text = "🔊  TESTAR VOZ"
            textSize = 20f
            minHeight = dp(64)
            setOnClickListener {
                NeuralSpeech.speak(this@MainActivity, "Olá. A voz está funcionando. Abra o WhatsApp, arraste o botão de alto-falante até uma mensagem e toque nele para ouvir.")
            }
        }
        val info = TextView(this).apply {
            text = "Uso: abra o WhatsApp. Arraste o botão 🔊 até a altura da mensagem e toque uma vez."
            textSize = 17f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(18), 0, 0)
        }

        root.addView(icon, full())
        root.addView(title, full())
        root.addView(subtitle, full())
        root.addView(status, full())
        root.addView(space(dp(16)))
        root.addView(activate, full())
        root.addView(space(dp(12)))
        root.addView(test, full())
        root.addView(info, full())
        setContentView(root)

        NeuralSpeech.warmUp(this,
            onReady = {
                runOnUiThread {
                    if (!isReaderEnabled(this)) {
                        NeuralSpeech.speak(this, "Leitor Fácil. Toque no botão ativar leitor. Na tela de acessibilidade, procure Leitor Fácil e ative.")
                    }
                }
            },
            onError = {
                runOnUiThread { Toast.makeText(this, "Falha ao preparar a voz", Toast.LENGTH_LONG).show() }
            })
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) {
            val enabled = isReaderEnabled(this)
            status.text = if (enabled) "✓ LEITOR ATIVADO" else "○ LEITOR DESATIVADO"
            status.setTextColor(if (enabled) Color.rgb(7, 94, 84) else Color.rgb(160, 45, 45))
            if (enabled) NeuralSpeech.speak(this, "Pronto. O leitor está ativado. Agora abra o WhatsApp.")
        }
    }

    private fun isReaderEnabled(context: Context): Boolean {
        val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val component = "$packageName/${WhatsAppReaderService::class.java.name}"
        return enabled.split(':').any { it.equals(component, ignoreCase = true) }
    }

    private fun full(): LinearLayout.LayoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    )

    private fun space(h: Int): View = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(1, h)
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
