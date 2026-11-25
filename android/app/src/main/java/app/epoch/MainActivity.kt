package app.epoch

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AlarmPlugin::class.java)
        registerPlugin(DevicePlugin::class.java)
        registerPlugin(BackupPlugin::class.java)
        super.onCreate(savedInstanceState)
        routeFrom(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        routeFrom(intent)
    }

    /** Widget taps open one screen. Only known routes are accepted (rule 6). */
    private fun routeFrom(intent: Intent?) {
        val route = intent?.getStringExtra(EXTRA_ROUTE)?.takeIf { it in Widgets.ROUTES } ?: return
        intent.removeExtra(EXTRA_ROUTE)
        bridge?.webView?.post { bridge?.webView?.evaluateJavascript("location.hash = '#/$route'", null) }
    }

    companion object {
        const val EXTRA_ROUTE = "route"
    }

    /**
     * Safety net: if an alarm is ringing, opening Epoch always shows the ring screen, so the alarm
     * can be stopped even when Android hid the notification / full-screen screen.
     */
    override fun onResume() {
        super.onResume()
        val rs = AlarmStore(this).ringState()
        if (rs != null && rs.phase == RingState.RINGING && RingService.running != null) {
            startActivity(Intent(this, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
