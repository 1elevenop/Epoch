package app.wake11

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity

/**
 * Lock-screen ring screen. Hosts the web app at #/ring (challenges, BLUEPRINT §9 ring path step 4).
 * If the web screen has not reported ready within 4 s, the native fallback takes over (§5.3).
 */
class RingActivity : BridgeActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var fallbackShown = false

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AlarmPlugin::class.java)
        registerPlugin(DevicePlugin::class.java)
        webReady = false
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // Back must not dismiss a ringing alarm (registered last, so it wins over Capacitor's handler).
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { /* ignore */ }
        })
        bridge.webView.loadUrl("${bridge.appUrl.trimEnd('/')}/#/ring")
        handler.postDelayed({ if (!webReady) showFallback() }, FALLBACK_MS)
    }

    override fun onResume() {
        super.onResume()
        RingController.onRingStopped = { _, _ -> runOnUiThread { checkStillNeeded() } }
        checkStillNeeded()
    }

    override fun onPause() {
        super.onPause()
        RingController.onRingStopped = null
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun checkStillNeeded() {
        val rs = AlarmStore(this).ringState()
        if (rs == null || rs.phase == RingState.SNOOZED || rs.phase == RingState.WAKE_CHECK_PENDING) finish()
        else if (fallbackShown) showFallback(force = true)
    }

    /** Which ring the fallback is showing; it is rebuilt only when this changes (not on every resume). */
    private var fallbackKey: String? = null

    /** Native screen used when the WebView is slow or broken. */
    private fun showFallback(force: Boolean = false) {
        if (fallbackShown && !force) return
        val store = AlarmStore(this)
        val rs = store.ringState() ?: return finish()
        val alarm = store.get(rs.alarmId) ?: return finish()
        val key = "${rs.instanceId}:${rs.phase}:${rs.snoozeCount}:${rs.escalated}"
        if (fallbackShown && key == fallbackKey) return // same ring: keep the problem and what was typed
        fallbackKey = key
        fallbackShown = true
        android.util.Log.w("WAKE11", "Ring web screen not ready in time — native fallback")
        if (rs.phase == RingState.WAKE_CHECK_PROMPT) {
            setContentView(wakeCheckView())
            return
        }
        val ctxJson = RingController.context(this)
        val left = if (ctxJson?.optBoolean("snoozeAllowed") == true) ctxJson.optInt("snoozesLeft") else 0
        setContentView(
            FallbackMathView(
                this,
                label = alarm.label,
                snoozesLeft = left,
                onSnooze = { RingController.snooze(this, alarm.id); finish() },
                onSolved = { RingController.dismiss(this, alarm.id); checkStillNeeded() },
            ),
        )
    }

    private fun wakeCheckView() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(Color.BLACK)
        addView(TextView(context).apply {
            text = "Are you up?"
            textSize = 40f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        })
        addView(Button(context).apply {
            text = "✓ I'm up"
            textSize = 28f
            contentDescription = "Yes, I am up"
            setOnClickListener { WakeCheck.confirm(this@RingActivity); finish() }
        })
    }

    companion object {
        private const val FALLBACK_MS = 4_000L

        /** Set by AlarmPlugin.ringReady() when the web ring screen has drawn itself. */
        @Volatile var webReady = false
    }
}
