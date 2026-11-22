package app.wake11

import android.app.Activity
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager

/**
 * Silent sunrise glow (BLUEPRINT §5.5): dark red → orange → white, screen brightness rising to full
 * by the alarm time. Progress is computed from timestamps (rule 2). Tap to close; it also closes
 * itself when the alarm starts ringing.
 */
class SunriseActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private var startAt = 0L
    private var endAt = 0L
    private lateinit var glow: GlowView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        current = this
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        readTimes(intent)
        glow = GlowView(this)
        glow.contentDescription = "Sunrise light before your alarm. Tap to close."
        glow.setOnClickListener { finish() }
        setContentView(glow)
        hideBars()
        Sunrise.clearNotification(this)
        tick()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readTimes(intent)
    }

    private fun readTimes(i: android.content.Intent) {
        endAt = i.getLongExtra(Sunrise.EXTRA_END, 0L)
        startAt = minOf(i.getLongExtra(Sunrise.EXTRA_START, endAt), endAt - 1_000)
    }

    private fun tick() {
        val now = System.currentTimeMillis()
        if (endAt <= now || AlarmStore(this).ringState() != null) {
            finish()
            return
        }
        val k = ((now - startAt).toFloat() / (endAt - startAt).coerceAtLeast(1)).coerceIn(0f, 1f)
        glow.progress = k
        // Brightness follows a gentle curve so the first minutes stay very dim.
        window.attributes = window.attributes.apply { screenBrightness = (0.01f + 0.99f * k * k).coerceIn(0.01f, 1f) }
        handler.postDelayed({ tick() }, 1_000)
    }

    @Suppress("DEPRECATION")
    private fun hideBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        if (current === this) current = null
        super.onDestroy()
    }

    companion object {
        @Volatile var current: SunriseActivity? = null

        /** Colour of the "sun" at progress k: dark red → orange → warm white. */
        fun colorAt(k: Float): Int {
            val stops = intArrayOf(Color.rgb(20, 0, 0), Color.rgb(120, 10, 0), Color.rgb(255, 110, 0), Color.rgb(255, 244, 224))
            val pos = k.coerceIn(0f, 1f) * (stops.size - 1)
            val i = pos.toInt().coerceAtMost(stops.size - 2)
            return blend(stops[i], stops[i + 1], pos - i)
        }

        private fun blend(a: Int, b: Int, t: Float): Int = Color.rgb(
            (Color.red(a) + (Color.red(b) - Color.red(a)) * t).toInt(),
            (Color.green(a) + (Color.green(b) - Color.green(a)) * t).toInt(),
            (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t).toInt(),
        )
    }

    /** Full-screen gradient: the brightest colour rises from the bottom as progress grows. */
    private class GlowView(ctx: Context) : View(ctx) {
        private val paint = Paint()
        var progress = 0f
            set(v) { field = v; invalidate() }

        override fun onDraw(canvas: Canvas) {
            val h = height.toFloat()
            val top = colorAt(progress * 0.6f)
            val bottom = colorAt(progress)
            paint.shader = LinearGradient(0f, h, 0f, h * (0.6f - 0.6f * progress), bottom, top, Shader.TileMode.CLAMP)
            canvas.drawRect(0f, 0f, width.toFloat(), h, paint)
        }
    }
}
