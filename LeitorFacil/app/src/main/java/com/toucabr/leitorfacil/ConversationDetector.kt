package com.toucabr.leitorfacil

import android.graphics.Rect
import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo
import java.util.Locale

/**
 * Fast guard used before creating any touch targets.
 *
 * WhatsApp's home/chat-list screens do not keep an editable message composer
 * in the lower half of the app. An open conversation does. Requiring that
 * composer prevents contact names and preview text on the home screen from
 * becoming readable targets.
 */
object ConversationDetector {
    fun isOpenConversation(
        root: AccessibilityNodeInfo,
        screenWidth: Int,
        screenHeight: Int,
        density: Float
    ): Boolean {
        return findComposer(
            node = root,
            screenWidth = screenWidth,
            screenHeight = screenHeight,
            density = density
        )
    }

    private fun findComposer(
        node: AccessibilityNodeInfo?,
        screenWidth: Int,
        screenHeight: Int,
        density: Float
    ): Boolean {
        if (node == null) return false

        try {
            if (
                looksLikeComposer(
                    node,
                    screenWidth,
                    screenHeight,
                    density
                )
            ) {
                return true
            }

            for (index in 0 until node.childCount) {
                val child = node.getChild(index) ?: continue
                val found = try {
                    findComposer(
                        child,
                        screenWidth,
                        screenHeight,
                        density
                    )
                } finally {
                    try {
                        child.recycle()
                    } catch (_: Throwable) {
                    }
                }

                if (found) return true
            }
        } catch (_: Throwable) {
        }

        return false
    }

    private fun looksLikeComposer(
        node: AccessibilityNodeInfo,
        screenWidth: Int,
        screenHeight: Int,
        density: Float
    ): Boolean {
        val rect = Rect()
        node.getBoundsInScreen(rect)

        if (rect.width() <= 0 || rect.height() <= 0) return false

        // Search bars are near the top. The message composer remains in the
        // lower portion of the conversation, even when the keyboard is open.
        val lowerEnough = rect.centerY() >= (screenHeight * 0.38f).toInt()
        val notHuge = rect.height() <= (110 * density).toInt()
        val wideEnough = rect.width() >= (screenWidth * 0.25f).toInt()

        if (!lowerEnough || !notHuge || !wideEnough) return false

        val className = node.className?.toString().orEmpty()
            .lowercase(Locale.ROOT)
        val viewId = node.viewIdResourceName.orEmpty()
            .lowercase(Locale.ROOT)

        val editable = try {
            node.isEditable
        } catch (_: Throwable) {
            false
        }

        val editClass =
            className.contains("edittext") ||
                className.contains("textfield")

        val idLooksLikeComposer =
            viewId.contains(":id/entry") ||
                viewId.contains("message_entry") ||
                viewId.contains("conversation_entry") ||
                viewId.contains("compose")

        val text = node.text?.toString().orEmpty()
        val description = node.contentDescription?.toString().orEmpty()
        val hint = if (Build.VERSION.SDK_INT >= 26) {
            node.hintText?.toString().orEmpty()
        } else {
            ""
        }

        val combined = (text + " " + description + " " + hint)
            .lowercase(Locale("pt", "BR"))

        val hintLooksLikeComposer =
            combined.contains("digite uma mensagem") ||
                combined.trim() == "mensagem" ||
                combined.contains("type a message")

        return (
            (editable || editClass) &&
                (idLooksLikeComposer || hintLooksLikeComposer || editClass)
            )
    }
}
