package com.toucabr.leitorfacil

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.FrameLayout
import android.widget.TextView
import kotlin.math.abs

class WhatsAppReaderService : AccessibilityService() {
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var overlayParams: WindowManager.LayoutParams? = null
    private var visible = false

    private val main = Handler(Looper.getMainLooper())
    private val whatsappPackages = setOf("com.whatsapp", "com.whatsapp.w4b")

    @Volatile
    private var currentMessageKey: String? = null

    override fun onServiceConnected() {
        super.onServiceConnected()

        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        if (Build.VERSION.SDK_INT >= 24) {
            createDirectTouchOverlay()
        } else {
            createLegacyBubble()
        }

        NeuralSpeech.warmUp(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString().orEmpty()

        if (pkg in whatsappPackages) {
            showOverlay()
            if (Build.VERSION.SDK_INT >= 24) {
                updateDirectOverlayBounds()
            }
        } else if (pkg.isNotBlank() && pkg != packageName) {
            hideOverlay()
        }
    }

    override fun onInterrupt() {
        stopReading()
    }

    override fun onDestroy() {
        stopReading()
        removeOverlay()
        super.onDestroy()
    }

    private fun createDirectTouchOverlay() {
        if (overlayView != null) return

        val view = FrameLayout(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            isClickable = true
            isFocusable = false
            contentDescription = "Área de leitura de mensagens"
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            dp(300),
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = dp(72)
        }

        attachDirectTouchListener(view)
        overlayView = view
        overlayParams = params
    }

    private fun attachDirectTouchListener(view: View) {
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        val longPressMs = 560L

        var downX = 0f
        var downY = 0f
        var downAt = 0L
        var lastX = 0f
        var lastY = 0f
        var moved = false
        var isDown = false
        var longTriggered = false

        val longPressAction = Runnable {
            if (
                isDown &&
                !moved &&
                !longTriggered &&
                Build.VERSION.SDK_INT >= 24
            ) {
                longTriggered = true
                readMessageAt(
                    downX.toInt(),
                    downY.toInt(),
                    fast = true
                )
            }
        }

        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    lastX = downX
                    lastY = downY
                    downAt = System.currentTimeMillis()
                    moved = false
                    isDown = true
                    longTriggered = false
                    main.postDelayed(longPressAction, longPressMs)
                    true
                }

                MotionEvent.ACTION_MOVE -> {
                    lastX = event.rawX
                    lastY = event.rawY

                    if (
                        abs(lastX - downX) > slop ||
                        abs(lastY - downY) > slop
                    ) {
                        moved = true
                        main.removeCallbacks(longPressAction)
                    }
                    true
                }

                MotionEvent.ACTION_UP -> {
                    isDown = false
                    main.removeCallbacks(longPressAction)

                    val duration = (
                        System.currentTimeMillis() - downAt
                    ).coerceIn(60L, 900L)

                    if (moved) {
                        replayGesture(
                            downX,
                            downY,
                            event.rawX,
                            event.rawY,
                            duration
                        )
                    } else if (!longTriggered) {
                        readOrPassTap(
                            event.rawX.toInt(),
                            event.rawY.toInt()
                        )
                    }

                    true
                }

                MotionEvent.ACTION_CANCEL -> {
                    isDown = false
                    main.removeCallbacks(longPressAction)

                    if (moved) {
                        replayGesture(
                            downX,
                            downY,
                            lastX,
                            lastY,
                            (
                                System.currentTimeMillis() - downAt
                            ).coerceIn(60L, 900L)
                        )
                    }

                    true
                }

                else -> true
            }
        }
    }

    private fun readOrPassTap(x: Int, y: Int) {
        val candidate = findMessageAt(x, y)

        if (candidate == null) {
            replayTap(x.toFloat(), y.toFloat())
            return
        }

        val key = candidate.stableKey()

        if (
            currentMessageKey == key &&
            NeuralSpeech.isSpeaking()
        ) {
            stopReading()
            return
        }

        currentMessageKey = key

        NeuralSpeech.speak(
            this,
            candidate.text,
            speed = 1.0f,
            onComplete = {
                if (currentMessageKey == key) {
                    currentMessageKey = null
                }
            },
            onError = {
                if (currentMessageKey == key) {
                    currentMessageKey = null
                }
            }
        )
    }

    private fun readMessageAt(
        x: Int,
        y: Int,
        fast: Boolean
    ) {
        val candidate = findMessageAt(x, y)

        if (candidate == null) {
            if (Build.VERSION.SDK_INT >= 24) {
                replayLongPress(
                    x.toFloat(),
                    y.toFloat()
                )
            }
            return
        }

        stopReading()

        val key = candidate.stableKey()
        currentMessageKey = key

        val speed = if (fast) {
            getLongPressSpeed()
        } else {
            1.0f
        }

        NeuralSpeech.speak(
            this,
            candidate.text,
            speed = speed,
            onComplete = {
                if (currentMessageKey == key) {
                    currentMessageKey = null
                }
            },
            onError = {
                if (currentMessageKey == key) {
                    currentMessageKey = null
                }
            }
        )
    }

    private fun findMessageAt(
        x: Int,
        y: Int
    ): MessageExtractor.Candidate? {
        val root = rootInActiveWindow ?: return null

        try {
            val pkg = root.packageName?.toString().orEmpty()
            if (pkg !in whatsappPackages) return null

            return MessageExtractor.atPoint(
                root,
                x,
                y,
                resources.displayMetrics.heightPixels,
                resources.displayMetrics.density
            )
        } finally {
            try {
                root.recycle()
            } catch (_: Throwable) {
            }
        }
    }

    private fun updateDirectOverlayBounds() {
        if (Build.VERSION.SDK_INT < 24) return

        val view = overlayView ?: return
        val params = overlayParams ?: return
        val root = rootInActiveWindow ?: return

        try {
            val pkg = root.packageName?.toString().orEmpty()
            if (pkg !in whatsappPackages) return

            val rootBounds = Rect()
            root.getBoundsInScreen(rootBounds)

            if (
                rootBounds.width() <= 0 ||
                rootBounds.height() <= 0
            ) {
                return
            }

            val keyboardTop = findKeyboardTop()
            val effectiveBottom = if (
                keyboardTop != null &&
                keyboardTop > rootBounds.top &&
                keyboardTop < rootBounds.bottom
            ) {
                keyboardTop
            } else {
                rootBounds.bottom
            }

            val topInset = dp(72)
            val bottomInset = dp(72)
            val top = rootBounds.top + topInset
            val bottom = effectiveBottom - bottomInset

            if (bottom - top < dp(80)) {
                hideOverlay()
                return
            }

            var changed = false

            if (params.x != rootBounds.left) {
                params.x = rootBounds.left
                changed = true
            }

            if (params.y != top) {
                params.y = top
                changed = true
            }

            if (params.width != rootBounds.width()) {
                params.width = rootBounds.width()
                changed = true
            }

            val newHeight = bottom - top
            if (params.height != newHeight) {
                params.height = newHeight
                changed = true
            }

            if (changed && visible) {
                try {
                    windowManager?.updateViewLayout(
                        view,
                        params
                    )
                } catch (_: Throwable) {
                }
            }
        } finally {
            try {
                root.recycle()
            } catch (_: Throwable) {
            }
        }
    }

    private fun findKeyboardTop(): Int? {
        if (Build.VERSION.SDK_INT < 21) return null

        return try {
            var best: Int? = null

            for (window in windows) {
                if (
                    window.type ==
                    AccessibilityWindowInfo.TYPE_INPUT_METHOD
                ) {
                    val rect = Rect()
                    window.getBoundsInScreen(rect)

                    if (rect.height() > 0) {
                        if (best == null || rect.top < best) {
                            best = rect.top
                        }
                    }
                }
            }

            best
        } catch (_: Throwable) {
            null
        }
    }

    private fun replayTap(
        x: Float,
        y: Float
    ) {
        if (Build.VERSION.SDK_INT < 24) return

        replayGesture(
            x,
            y,
            x + 0.1f,
            y + 0.1f,
            55L
        )
    }

    private fun replayLongPress(
        x: Float,
        y: Float
    ) {
        if (Build.VERSION.SDK_INT < 24) return

        replayGesture(
            x,
            y,
            x + 0.1f,
            y + 0.1f,
            650L
        )
    }

    private fun replayGesture(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        durationMs: Long
    ) {
        if (Build.VERSION.SDK_INT < 24) return

        setDirectOverlayTouchable(false)

        main.postDelayed({
            val path = Path().apply {
                moveTo(startX, startY)
                lineTo(endX, endY)
            }

            val gesture = GestureDescription.Builder()
                .addStroke(
                    GestureDescription.StrokeDescription(
                        path,
                        0L,
                        durationMs.coerceIn(40L, 900L)
                    )
                )
                .build()

            val callback = object :
                GestureResultCallback() {

                override fun onCompleted(
                    gestureDescription: GestureDescription?
                ) {
                    main.postDelayed({
                        if (visible) {
                            setDirectOverlayTouchable(true)
                        }
                    }, 35L)
                }

                override fun onCancelled(
                    gestureDescription: GestureDescription?
                ) {
                    main.postDelayed({
                        if (visible) {
                            setDirectOverlayTouchable(true)
                        }
                    }, 35L)
                }
            }

            val accepted = dispatchGesture(
                gesture,
                callback,
                main
            )

            if (!accepted) {
                setDirectOverlayTouchable(true)
            }
        }, 24L)
    }

    private fun setDirectOverlayTouchable(
        touchable: Boolean
    ) {
        if (Build.VERSION.SDK_INT < 24) return

        val view = overlayView ?: return
        val params = overlayParams ?: return

        val newFlags = if (touchable) {
            params.flags and
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        } else {
            params.flags or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        }

        if (newFlags == params.flags) return

        params.flags = newFlags

        if (visible) {
            try {
                windowManager?.updateViewLayout(
                    view,
                    params
                )
            } catch (_: Throwable) {
            }
        }
    }

    private fun createLegacyBubble() {
        if (overlayView != null) return

        val size = dp(62)

        val background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.rgb(18, 140, 126))
            setStroke(dp(3), Color.WHITE)
        }

        val view = TextView(this).apply {
            text = "🔊"
            textSize = 27f
            gravity = Gravity.CENTER
            this.background = background
            contentDescription = "Ler mensagem"
        }

        val params = WindowManager.LayoutParams(
            size,
            size,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(10)
            y = resources.displayMetrics.heightPixels / 2
        }

        attachLegacyBubbleListener(view, params)

        overlayView = view
        overlayParams = params
    }

    private fun attachLegacyBubbleListener(
        view: View,
        params: WindowManager.LayoutParams
    ) {
        val slop = ViewConfiguration.get(this).scaledTouchSlop

        var downX = 0f
        var downY = 0f
        var startY = 0
        var moved = false
        var downAt = 0L

        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startY = params.y
                    moved = false
                    downAt = System.currentTimeMillis()
                    true
                }

                MotionEvent.ACTION_MOVE -> {
                    if (
                        abs(event.rawX - downX) > slop ||
                        abs(event.rawY - downY) > slop
                    ) {
                        moved = true
                    }

                    if (moved) {
                        val maxY =
                            resources.displayMetrics.heightPixels -
                                params.height -
                                dp(24)

                        params.y = (
                            startY +
                                (event.rawY - downY).toInt()
                            ).coerceIn(
                            dp(24),
                            maxY
                        )

                        try {
                            windowManager?.updateViewLayout(
                                view,
                                params
                            )
                        } catch (_: Throwable) {
                        }
                    }

                    true
                }

                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        val held =
                            System.currentTimeMillis() - downAt
                        readLegacyNearest(
                            fast = held >= 560L
                        )
                    }
                    true
                }

                else -> true
            }
        }
    }

    private fun readLegacyNearest(fast: Boolean) {
        val root = rootInActiveWindow ?: return

        try {
            val pkg = root.packageName?.toString().orEmpty()
            if (pkg !in whatsappPackages) return

            val params = overlayParams ?: return
            val targetY =
                params.y + params.height / 2

            val candidate = MessageExtractor.nearest(
                root,
                targetY,
                resources.displayMetrics.heightPixels,
                resources.displayMetrics.density
            ) ?: return

            val key = candidate.stableKey()

            if (
                !fast &&
                currentMessageKey == key &&
                NeuralSpeech.isSpeaking()
            ) {
                stopReading()
                return
            }

            stopReading()
            currentMessageKey = key

            NeuralSpeech.speak(
                this,
                candidate.text,
                speed = if (fast) getLongPressSpeed() else 1.0f,
                onComplete = {
                    if (currentMessageKey == key) {
                        currentMessageKey = null
                    }
                },
                onError = {
                    if (currentMessageKey == key) {
                        currentMessageKey = null
                    }
                }
            )
        } finally {
            try {
                root.recycle()
            } catch (_: Throwable) {
            }
        }
    }

    private fun getLongPressSpeed(): Float {
        return getSharedPreferences(
            MainActivity.PREFS,
            Context.MODE_PRIVATE
        ).getFloat(
            MainActivity.KEY_LONG_PRESS_SPEED,
            MainActivity.DEFAULT_LONG_PRESS_SPEED
        ).coerceIn(1.0f, 2.0f)
    }

    private fun stopReading() {
        NeuralSpeech.stop()
        currentMessageKey = null
    }

    private fun showOverlay() {
        if (visible) return

        val view = overlayView ?: return
        val params = overlayParams ?: return

        main.post {
            if (visible) return@post

            try {
                windowManager?.addView(
                    view,
                    params
                )
                visible = true

                if (Build.VERSION.SDK_INT >= 24) {
                    updateDirectOverlayBounds()
                }
            } catch (_: Throwable) {
            }
        }
    }

    private fun hideOverlay() {
        if (!visible) return

        val view = overlayView ?: return

        main.post {
            if (!visible) return@post

            try {
                windowManager?.removeView(view)
            } catch (_: Throwable) {
            }

            visible = false
        }
    }

    private fun removeOverlay() {
        val view = overlayView ?: return

        try {
            if (visible) {
                windowManager?.removeView(view)
            }
        } catch (_: Throwable) {
        }

        visible = false
        overlayView = null
        overlayParams = null
    }

    private fun dp(value: Int): Int =
        (
            value *
                resources.displayMetrics.density
            ).toInt()
}
