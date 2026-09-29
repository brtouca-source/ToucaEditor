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
import android.widget.TextView
import android.widget.Toast
import kotlin.math.roundToInt

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var speedValue: TextView
    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val pad = dp(20)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(Color.rgb(244, 247, 246))
        }

        val icon = TextView(this).apply {
            text = "🔊"
            textSize = 58f
            gravity = Gravity.CENTER
            setPadding(0, dp(4), 0, dp(4))
        }

        val title = TextView(this).apply {
            text = "Leitor Fácil"
            textSize = 28f
            setTextColor(Color.rgb(19, 35, 31))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        }

        val subtitle = TextView(this).apply {
            text = "Toque diretamente em uma mensagem do WhatsApp para ouvir."
            textSize = 18f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(14))
        }

        status = TextView(this).apply {
            textSize = 19f
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }

        root.addView(icon, full())
        root.addView(title, full())
        root.addView(subtitle, full())
        root.addView(status, full())

        if (Build.VERSION.SDK_INT >= 33) {
            root.addView(space(dp(10)))
            val restrictedInfo = TextView(this).apply {
                text = "Android 13 ou mais recente: apps instalados por APK podem exigir liberação de Configurações restritas."
                textSize = 15f
                setTextColor(Color.DKGRAY)
                gravity = Gravity.CENTER
            }
            root.addView(restrictedInfo, full())

            val allowRestricted = Button(this).apply {
                text = "1. LIBERAR ACESSO DO ANDROID"
                textSize = 18f
                setTypeface(typeface, Typeface.BOLD)
                minHeight = dp(62)
                setOnClickListener {
                    NeuralSpeech.speak(
                        this@MainActivity,
                        "Na tela que vai abrir, toque nos três pontinhos no canto superior direito e depois em Permitir configurações restritas. Depois volte para o Leitor Fácil."
                    )
                    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:" + packageName)
                    }
                    startActivity(intent)
                }
            }
            root.addView(space(dp(8)))
            root.addView(allowRestricted, full())
        }

        val activate = Button(this).apply {
            text = if (Build.VERSION.SDK_INT >= 33) "2. ATIVAR LEITOR" else "ATIVAR LEITOR"
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
            minHeight = dp(68)
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }
        root.addView(space(dp(8)))
        root.addView(activate, full())

        val test = Button(this).apply {
            text = "🔊  TESTAR VOZ"
            textSize = 18f
            minHeight = dp(58)
            setOnClickListener {
                NeuralSpeech.speak(
                    this@MainActivity,
                    "Olá. A voz está funcionando. Toque em uma mensagem para ouvir. Toque novamente na mesma mensagem para parar."
                )
            }
        }
        root.addView(space(dp(8)))
        root.addView(test, full())

        val speedTitle = TextView(this).apply {
            text = "VELOCIDADE AO SEGURAR"
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(35, 55, 50))
            gravity = Gravity.CENTER
            setPadding(0, dp(18), 0, dp(8))
        }
        root.addView(speedTitle, full())

        val speedRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        val minus = Button(this).apply {
            text = "−"
            textSize = 28f
            minWidth = dp(72)
            minHeight = dp(58)
            setOnClickListener { changeSpeed(-0.1f) }
        }

        speedValue = TextView(this).apply {
            textSize = 24f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(18, 140, 126))
            gravity = Gravity.CENTER
            setPadding(dp(20), 0, dp(20), 0)
        }

        val plus = Button(this).apply {
            text = "+"
            textSize = 26f
            minWidth = dp(72)
            minHeight = dp(58)
            setOnClickListener { changeSpeed(0.1f) }
        }

        speedRow.addView(minus)
        speedRow.addView(speedValue, LinearLayout.LayoutParams(dp(110), dp(58)))
        speedRow.addView(plus)
        root.addView(speedRow, full())
        updateSpeedLabel()

        val info = TextView(this).apply {
            text = "TOQUE: ler a mensagem\nTOQUE DE NOVO: parar\nSEGURAR: ler mais rápido\n\nNão usa câmera, microfone, contatos, arquivos ou internet."
            textSize = 16f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(18), 0, 0)
        }
        root.addView(info, full())

        setContentView(root)

        NeuralSpeech.warmUp(
            this,
            onReady = {
                runOnUiThread {
                    if (!isReaderEnabled(this)) {
                        val message = if (Build.VERSION.SDK_INT >= 33) {
                            "Leitor Fácil. Neste Android, primeiro libere o acesso do Android. Depois ative o leitor."
                        } else {
                            "Leitor Fácil. Toque em ativar leitor e ative o Leitor Fácil na tela de acessibilidade."
                        }
                        NeuralSpeech.speak(this, message)
                    }
                }
            },
            onError = {
                runOnUiThread {
                    Toast.makeText(this, "Falha ao preparar a voz", Toast.LENGTH_LONG).show()
                }
            }
        )
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) {
            val enabled = isReaderEnabled(this)
            status.text = if (enabled) "✓ LEITOR ATIVADO" else "○ LEITOR DESATIVADO"
            status.setTextColor(if (enabled) Color.rgb(7, 94, 84) else Color.rgb(160, 45, 45))
        }
        if (::speedValue.isInitialized) updateSpeedLabel()
    }

    private fun changeSpeed(delta: Float) {
        val current = getLongPressSpeed()
        val next = ((current + delta) * 10f).roundToInt() / 10f
        val clamped = next.coerceIn(1.0f, 2.0f)
        prefs.edit().putFloat(KEY_LONG_PRESS_SPEED, clamped).apply()
        updateSpeedLabel()
        NeuralSpeech.speak(this, "Velocidade " + formatSpeedSpoken(clamped))
    }

    private fun updateSpeedLabel() {
        speedValue.text = String.format(java.util.Locale.US, "%.1f×", getLongPressSpeed())
    }

    private fun getLongPressSpeed(): Float =
        prefs.getFloat(KEY_LONG_PRESS_SPEED, DEFAULT_LONG_PRESS_SPEED).coerceIn(1.0f, 2.0f)

    private fun formatSpeedSpoken(speed: Float): String {
        val tenths = (speed * 10).roundToInt()
        return if (tenths % 10 == 0) {
            (tenths / 10).toString() + " vez"
        } else {
            (tenths / 10).toString() + " vírgula " + (tenths % 10).toString() + " vezes"
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

    private fun full(): LinearLayout.LayoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    )

    private fun space(h: Int): View = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(1, h)
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val PREFS = "leitor_facil_settings"
        const val KEY_LONG_PRESS_SPEED = "long_press_speed"
        const val DEFAULT_LONG_PRESS_SPEED = 1.5f
    }
}
