package app.wake11

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/**
 * Native ring screen with a level-3 math problem: 2-digit + 2-digit (BLUEPRINT §5.3 native fallback).
 * Built in code — no XML — so it works even if the WebView is broken.
 */
class FallbackMathView(
    ctx: Context,
    private val label: String,
    private val snoozesLeft: Int,
    private val onSnooze: () -> Unit,
    private val onSolved: () -> Unit,
    private val random: Random = Random.Default,
) : LinearLayout(ctx) {
    private val problem = TextView(ctx)
    private val answer = TextView(ctx)
    private val status = TextView(ctx)
    private var expected = 0
    private var typed = ""

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setBackgroundColor(Color.BLACK)
        setPadding(dp(20), dp(48), dp(20), dp(24))

        addView(text(SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date()), 72f, "#F2F3F5", bold = false))
        addView(text(label.ifBlank { "Alarm" }, 20f, "#9AA0A6"))
        addView(space(24))
        addView(problem.apply { style(this, 34f, "#F2F3F5") })
        addView(answer.apply { style(this, 40f, "#FF8A3D"); minHeight = dp(56) })
        addView(status.apply { style(this, 15f, "#FF5A5F") })
        addView(space(12))
        addView(keypad(), LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
        addView(space(16))

        val snooze = button(if (snoozesLeft > 0) "Snooze ($snoozesLeft left)" else "Snooze locked", "#1A1C20")
        snooze.isEnabled = snoozesLeft > 0
        snooze.alpha = if (snoozesLeft > 0) 1f else 0.4f
        snooze.setOnClickListener { onSnooze() }
        addView(snooze, LayoutParams(LayoutParams.MATCH_PARENT, dp(60)))
        newProblem()
    }

    private fun newProblem() {
        val a = random.nextInt(10, 50)
        val b = random.nextInt(10, 50)
        expected = a + b
        problem.text = "$a + $b = ?"
        typed = ""
        answer.text = "_"
    }

    private fun keypad(): View {
        val grid = GridLayout(context).apply { columnCount = 3 }
        val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓")
        for (k in keys) {
            val b = button(k, if (k == "✓") "#FF8A3D" else "#1A1C20")
            if (k == "✓") b.setTextColor(Color.BLACK)
            b.contentDescription = when (k) { "⌫" -> "Delete"; "✓" -> "Check answer"; else -> k }
            b.setOnClickListener { press(k) }
            val lp = GridLayout.LayoutParams().apply {
                width = dp(96); height = dp(64); setMargins(dp(4), dp(4), dp(4), dp(4))
            }
            grid.addView(b, lp)
        }
        return grid
    }

    private fun press(k: String) {
        when (k) {
            "⌫" -> typed = typed.dropLast(1)
            "✓" -> {
                if (typed.isEmpty()) return
                if (typed.toIntOrNull() == expected) {
                    onSolved()
                    return
                }
                status.text = "✗ $typed is wrong (${problem.text.removeSuffix(" = ?")} = $expected). New problem."
                newProblem()
                return
            }
            else -> if (typed.length < 5) typed += k
        }
        answer.text = typed.ifEmpty { "_" }
    }

    private fun text(s: String, size: Float, color: String, bold: Boolean = true) =
        TextView(context).apply { text = s; style(this, size, color, bold) }

    private fun style(t: TextView, size: Float, color: String, bold: Boolean = true) {
        t.textSize = size
        t.setTextColor(Color.parseColor(color))
        t.gravity = Gravity.CENTER
        if (bold) t.typeface = Typeface.DEFAULT_BOLD
    }

    private fun button(s: String, bg: String) = Button(context).apply {
        text = s
        textSize = 22f
        isAllCaps = false
        setTextColor(Color.parseColor("#F2F3F5"))
        background = GradientDrawable().apply { cornerRadius = dp(16).toFloat(); setColor(Color.parseColor(bg)) }
    }

    private fun space(h: Int) = View(context).apply { layoutParams = LayoutParams(1, dp(h)) }
}
