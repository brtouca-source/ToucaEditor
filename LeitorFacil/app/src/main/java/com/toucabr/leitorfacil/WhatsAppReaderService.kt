package com.toucabr.leitorfacil

import android.accessibilityservice.AccessibilityService
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.TextView
import kotlin.math.abs

class WhatsAppReaderService : AccessibilityService() {
    private var windowManager: WindowManager? = null
    private var bubble: TextView? = null
    private var params: WindowManager.LayoutParams? = null
    private var visible = false
    private val main = Handler(Looper.getMainLooper())

    private val whatsappPackages = setOf("com.whatsapp", "com.whatsapp.w4b")

    override fun onServiceConnected() {
        super.onServiceConnected()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createBubble()
        NeuralSpeech.warmUp(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString().orEmpty()
        if (pkg in whatsappPackages) showBubble() else hideBubble()
    }

    override fun onInterrupt() {
        NeuralSpeech.stop()
    }

    override fun onDestroy() {
        NeuralSpeech.stop()
        removeBubble()
        super.onDestroy()
    }

    private fun createBubble() {
        if (bubble != null) return
        val size = dp(62)
        val bg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.rgb(18, 140, 126))
            setStroke(dp(3), Color.WHITE)
        }
        val view = TextView(this).apply {
            text = "🔊"
            textSize = 27f
            gravity = Gravity.CENTER
            background = bg
            elevation = dp(8).toFloat()
            contentDescription = "Ler mensagem"
        }

        val lp = WindowManager.LayoutParams(
            size,
            size,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(10)
            y = resources.displayMetrics.heightPixels / 2
        }

        attachDragAndTap(view, lp)
        bubble = view
        params = lp
    }

    private fun attachDragAndTap(view: View, lp: WindowManager.LayoutParams) {
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startY = 0
        var moved = false
        var downAt = 0L

        view.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX
                    downY = e.rawY
                    startY = lp.y
                    moved = false
                    downAt = System.currentTimeMillis()
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (abs(e.rawX - downX) > slop || abs(e.rawY - downY) > slop) moved = true
                    if (moved) {
                        val maxY = resources.displayMetrics.heightPixels - lp.height - dp(24)
                        lp.y = (startY + (e.rawY - downY).toInt()).coerceIn(dp(24), maxY)
                        try { windowManager?.updateViewLayout(view, lp) } catch (_: Throwable) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!moved && e.actionMasked == MotionEvent.ACTION_UP) {
                        val held = System.currentTimeMillis() - downAt
                        if (held >= 650) {
                            NeuralSpeech.stop()
                            announce("Leitura parada")
                        } else {
                            readNearestMessage()
                        }
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun readNearestMessage() {
        val root = rootInActiveWindow ?: run {
            announce("Não encontrei a conversa")
            return
        }
        try {
            val pkg = root.packageName?.toString().orEmpty()
            if (pkg !in whatsappPackages) {
                announce("Abra uma conversa do WhatsApp")
                return
            }
            val lp = params ?: return
            val targetY = lp.y + lp.height / 2
            val candidate = MessageExtractor.nearest(
                root,
                targetY,
                resources.displayMetrics.heightPixels,
                resources.displayMetrics.density
            )
            if (candidate == null) {
                announce("Não encontrei uma mensagem nessa altura")
            } else {
                NeuralSpeech.speak(this, candidate.text) { announce("Não consegui gerar a voz") }
            }
        } finally {
            try { root.recycle() } catch (_: Throwable) {}
        }
    }

    private fun announce(text: String) {
        NeuralSpeech.speak(this, text)
    }

    private fun showBubble() {
        if (visible) return
        val b = bubble ?: return
        val lp = params ?: return
        main.post {
            if (visible) return@post
            try {
                windowManager?.addView(b, lp)
                visible = true
            } catch (_: Throwable) {}
        }
    }

    private fun hideBubble() {
        if (!visible) return
        val b = bubble ?: return
        main.post {
            if (!visible) return@post
            try { windowManager?.removeView(b) } catch (_: Throwable) {}
            visible = false
        }
    }

    private fun removeBubble() {
        val b = bubble ?: return
        try { if (visible) windowManager?.removeView(b) } catch (_: Throwable) {}
        visible = false
        bubble = null
        params = null
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
