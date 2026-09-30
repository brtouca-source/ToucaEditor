package com.toucabr.leitorfacil

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.FrameLayout
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

class WhatsAppReaderService : AccessibilityService() {
    private data class TargetOverlay(
        val candidate: MessageExtractor.Candidate,
        val view: View
    )

    private val main = Handler(Looper.getMainLooper())
    private val whatsappPackages = setOf(
        "com.whatsapp",
        "com.whatsapp.w4b"
    )

    private var windowManager: WindowManager? = null
    private val targets = ArrayList<TargetOverlay>()
    private var targetSignature = ""

    private var highlightView: View? = null
    private var highlightBounds: Rect? = null

    @Volatile
    private var currentMessageKey: String? = null

    @Volatile
    private var currentMessageText: String? = null

    private val refreshPending = AtomicBoolean(false)
    private var chatActive = false
    private var whatsappForeground = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        scheduleRefresh(100L)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val pkg = event.packageName?.toString().orEmpty()

        if (pkg !in whatsappPackages) {
            if (
                event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                event.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED
            ) {
                if (whatsappForeground) {
                    whatsappForeground = false
                    NeuralSpeech.leaveWhatsApp()
                }
                scheduleRefresh(180L)
            }
            return
        }

        if (!whatsappForeground) {
            whatsappForeground = true
            // Start loading/priming as soon as WhatsApp itself is opened.
            // Reading targets are still created only inside an actual chat.
            NeuralSpeech.enterWhatsApp(this)
        }

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOWS_CHANGED -> {
                scheduleRefresh(60L)
            }

            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                scheduleRefresh(110L)
            }

            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                // WhatsApp emits many content-change events while typing,
                // receiving status updates, and animating its UI. Coalesce
                // them aggressively to avoid continuous tree traversal.
                scheduleRefresh(if (chatActive) 280L else 180L)
            }
        }
    }

    override fun onInterrupt() {
        stopReading(160L)
    }

    override fun onDestroy() {
        NeuralSpeech.stop()
        NeuralSpeech.leaveWhatsApp()
        clearTargets()
        removeHighlight(immediate = true)
        super.onDestroy()
    }

    private fun scheduleRefresh(delayMs: Long) {
        if (!refreshPending.compareAndSet(false, true)) return

        main.postDelayed({
            refreshPending.set(false)
            refreshTargets()
        }, delayMs)
    }

    private fun refreshTargets() {
        val root = rootInActiveWindow

        if (root == null) {
            clearTargets()
            return
        }

        try {
            val pkg = root.packageName?.toString().orEmpty()

            if (pkg !in whatsappPackages) {
                if (whatsappForeground) {
                    whatsappForeground = false
                    NeuralSpeech.leaveWhatsApp()
                }
                deactivateConversation()
                return
            }

            if (!whatsappForeground) {
                whatsappForeground = true
                NeuralSpeech.enterWhatsApp(this)
            }

            val metrics = resources.displayMetrics

            val isConversation = ConversationDetector.isOpenConversation(
                root = root,
                screenWidth = metrics.widthPixels,
                screenHeight = metrics.heightPixels,
                density = metrics.density
            )

            if (!isConversation) {
                deactivateConversation()
                return
            }

            activateConversation()

            val messages = MessageExtractor.visibleMessages(
                root = root,
                screenWidth = metrics.widthPixels,
                screenHeight = metrics.heightPixels,
                density = metrics.density
            )

            val signature = messages.joinToString("§") {
                it.stableKey()
            }

            if (signature != targetSignature) {
                rebuildTargets(messages)
                targetSignature = signature
            }

            repositionActiveHighlight(messages)
        } finally {
            try {
                root.recycle()
            } catch (_: Throwable) {
            }
        }
    }

    private fun activateConversation() {
        if (chatActive) return
        chatActive = true
    }

    private fun deactivateConversation() {
        if (!chatActive && targets.isEmpty()) return

        chatActive = false

        if (NeuralSpeech.isSpeaking()) {
            stopReading(160L)
        } else {
            removeHighlight(immediate = true)
        }

        clearTargets()
        // Do not unload the neural engine here. The user may simply be on the
        // WhatsApp conversation list and open another chat next.
    }

    private fun isConversationStillOpen(): Boolean {
        val root = rootInActiveWindow ?: return false

        return try {
            val pkg = root.packageName?.toString().orEmpty()
            if (pkg !in whatsappPackages) {
                false
            } else {
                val metrics = resources.displayMetrics
                ConversationDetector.isOpenConversation(
                    root = root,
                    screenWidth = metrics.widthPixels,
                    screenHeight = metrics.heightPixels,
                    density = metrics.density
                )
            }
        } finally {
            try {
                root.recycle()
            } catch (_: Throwable) {
            }
        }
    }

    private fun rebuildTargets(
        messages: List<MessageExtractor.Candidate>
    ) {
        clearTargets(resetSignature = false)

        for (candidate in messages) {
            addTarget(candidate)
        }
    }

    private fun addTarget(
        candidate: MessageExtractor.Candidate
    ) {
        val wm = windowManager ?: return
        val density = resources.displayMetrics.density

        // Keep the touch interception close to the visible text instead of
        // covering the whole WhatsApp conversation.
        val area = Rect(candidate.textBounds)
        val expandX = (7 * density).toInt()
        val expandY = (6 * density).toInt()
        area.inset(-expandX, -expandY)

        // Never let the hit area extend beyond the message bubble.
        area.left = area.left.coerceAtLeast(candidate.bubbleBounds.left)
        area.top = area.top.coerceAtLeast(candidate.bubbleBounds.top)
        area.right = area.right.coerceAtMost(candidate.bubbleBounds.right)
        area.bottom = area.bottom.coerceAtMost(candidate.bubbleBounds.bottom)

        if (area.width() < dp(14) || area.height() < dp(14)) return

        val view = FrameLayout(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            isFocusable = false
            isClickable = true
            contentDescription = "Ler mensagem"
        }

        val params = WindowManager.LayoutParams(
            area.width(),
            area.height(),
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = area.left
            y = area.top
        }

        attachTargetTouch(
            view = view,
            candidate = candidate
        )

        try {
            wm.addView(view, params)
            targets.add(
                TargetOverlay(
                    candidate = candidate,
                    view = view
                )
            )
        } catch (_: Throwable) {
        }
    }

    private fun attachTargetTouch(
        view: View,
        candidate: MessageExtractor.Candidate
    ) {
        val slop = ViewConfiguration.get(this).scaledTouchSlop
        val longPressDelegateAt = 260L

        var downX = 0f
        var downY = 0f
        var downAt = 0L
        var moved = false
        var longDelegated = false

        val delegateLongPress = Runnable {
            if (!moved && !longDelegated) {
                longDelegated = true
                delegateLongPressToWhatsApp(
                    view = view,
                    x = downX,
                    y = downY
                )
            }
        }

        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    downAt = System.currentTimeMillis()
                    moved = false
                    longDelegated = false
                    main.postDelayed(
                        delegateLongPress,
                        longPressDelegateAt
                    )
                    true
                }

                MotionEvent.ACTION_MOVE -> {
                    if (
                        abs(event.rawX - downX) > slop ||
                        abs(event.rawY - downY) > slop
                    ) {
                        moved = true
                        main.removeCallbacks(delegateLongPress)
                    }
                    true
                }

                MotionEvent.ACTION_UP -> {
                    main.removeCallbacks(delegateLongPress)

                    if (longDelegated) {
                        return@setOnTouchListener true
                    }

                    if (moved) {
                        delegateSwipeToWhatsApp(
                            startX = downX,
                            startY = downY,
                            endX = event.rawX,
                            endY = event.rawY,
                            durationMs = (
                                System.currentTimeMillis() - downAt
                                ).coerceIn(80L, 650L)
                        )
                    } else {
                        onMessageTap(candidate)
                    }

                    true
                }

                MotionEvent.ACTION_CANCEL -> {
                    main.removeCallbacks(delegateLongPress)
                    true
                }

                else -> true
            }
        }
    }

    private fun onMessageTap(
        candidate: MessageExtractor.Candidate
    ) {
        // A target may survive for a few milliseconds during navigation.
        // Re-check before speaking so the home/contact list is never read.
        if (!chatActive || !isConversationStillOpen()) {
            deactivateConversation()
            return
        }

        val key = candidate.stableKey()

        if (
            currentMessageKey == key &&
            NeuralSpeech.isSpeaking()
        ) {
            stopReading(190L)
            return
        }

        NeuralSpeech.stop()
        removeHighlight(immediate = true)

        currentMessageKey = key
        currentMessageText = candidate.text

        showHighlight(candidate.bubbleBounds)

        NeuralSpeech.speak(
            context = this,
            rawText = candidate.text,
            sid = VoiceSettings.getSid(this),
            onComplete = {
                main.post {
                    if (currentMessageKey == key) {
                        currentMessageKey = null
                        currentMessageText = null
                        fadeHighlight(360L)
                    }
                }
            },
            onError = {
                main.post {
                    if (currentMessageKey == key) {
                        currentMessageKey = null
                        currentMessageText = null
                        fadeHighlight(180L)
                    }
                }
            }
        )
    }

    private fun stopReading(fadeMs: Long) {
        NeuralSpeech.stop()
        currentMessageKey = null
        currentMessageText = null
        main.post {
            fadeHighlight(fadeMs)
        }
    }

    private fun showHighlight(bounds: Rect) {
        val wm = windowManager ?: return

        removeHighlight(immediate = true)

        val visual = Rect(bounds)
        visual.inset(-dp(2), -dp(2))

        val drawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = dp(12).toFloat()
            setColor(Color.argb(34, 65, 190, 255))
            setStroke(
                dp(3),
                Color.rgb(45, 185, 255)
            )
        }

        val view = View(this).apply {
            background = drawable
            alpha = 1f
        }

        val params = WindowManager.LayoutParams(
            visual.width(),
            visual.height(),
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = visual.left
            y = visual.top
        }

        try {
            wm.addView(view, params)
            highlightView = view
            highlightBounds = Rect(bounds)
        } catch (_: Throwable) {
        }
    }

    private fun repositionActiveHighlight(
        messages: List<MessageExtractor.Candidate>
    ) {
        val activeText = currentMessageText ?: return
        val current = highlightView ?: return

        val match = messages
            .filter { it.text == activeText }
            .minByOrNull { candidate ->
                val old = highlightBounds
                if (old == null) 0
                else abs(candidate.bubbleBounds.top - old.top)
            } ?: return

        val old = highlightBounds
        if (old == match.bubbleBounds) return

        val visual = Rect(match.bubbleBounds)
        visual.inset(-dp(2), -dp(2))

        val params = current.layoutParams as? WindowManager.LayoutParams
            ?: return

        params.x = visual.left
        params.y = visual.top
        params.width = visual.width()
        params.height = visual.height()

        try {
            windowManager?.updateViewLayout(current, params)
            highlightBounds = Rect(match.bubbleBounds)
        } catch (_: Throwable) {
        }
    }

    private fun fadeHighlight(durationMs: Long) {
        val view = highlightView ?: return

        view.animate()
            .alpha(0f)
            .setDuration(durationMs)
            .withEndAction {
                if (highlightView === view) {
                    removeHighlight(immediate = true)
                } else {
                    try {
                        windowManager?.removeView(view)
                    } catch (_: Throwable) {
                    }
                }
            }
            .start()
    }

    private fun removeHighlight(immediate: Boolean) {
        val view = highlightView ?: return

        if (!immediate) {
            fadeHighlight(220L)
            return
        }

        try {
            view.animate().cancel()
            windowManager?.removeView(view)
        } catch (_: Throwable) {
        }

        highlightView = null
        highlightBounds = null
    }

    private fun delegateLongPressToWhatsApp(
        view: View,
        x: Float,
        y: Float
    ) {
        // Long press belongs entirely to WhatsApp. Remove only the touched
        // target, inject the native hold, then rebuild the tiny target regions.
        removeTargetView(view)

        main.postDelayed({
            dispatchPathGesture(
                startX = x,
                startY = y,
                endX = x + 0.1f,
                endY = y + 0.1f,
                durationMs = 520L,
                after = {
                    scheduleRefresh(120L)
                }
            )
        }, 20L)
    }

    private fun delegateSwipeToWhatsApp(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        durationMs: Long
    ) {
        // This path is used only when a swipe starts directly on message text.
        // Everywhere else WhatsApp receives touch normally.
        clearTargets()

        main.postDelayed({
            dispatchPathGesture(
                startX = startX,
                startY = startY,
                endX = endX,
                endY = endY,
                durationMs = durationMs,
                after = {
                    scheduleRefresh(90L)
                }
            )
        }, 16L)
    }

    private fun dispatchPathGesture(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        durationMs: Long,
        after: () -> Unit
    ) {
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(
                GestureDescription.StrokeDescription(
                    path,
                    0L,
                    durationMs.coerceIn(60L, 700L)
                )
            )
            .build()

        val callback = object : GestureResultCallback() {
            override fun onCompleted(
                gestureDescription: GestureDescription?
            ) {
                after()
            }

            override fun onCancelled(
                gestureDescription: GestureDescription?
            ) {
                after()
            }
        }

        if (!dispatchGesture(gesture, callback, main)) {
            after()
        }
    }

    private fun removeTargetView(view: View) {
        val iterator = targets.iterator()

        while (iterator.hasNext()) {
            val target = iterator.next()
            if (target.view === view) {
                try {
                    windowManager?.removeView(target.view)
                } catch (_: Throwable) {
                }
                iterator.remove()
                break
            }
        }

        targetSignature = ""
    }

    private fun clearTargets(
        resetSignature: Boolean = true
    ) {
        for (target in targets) {
            try {
                windowManager?.removeView(target.view)
            } catch (_: Throwable) {
            }
        }

        targets.clear()
        if (resetSignature) targetSignature = ""
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}
