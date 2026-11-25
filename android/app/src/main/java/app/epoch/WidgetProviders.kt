package app.epoch

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast
import org.json.JSONObject

/** One provider per widget; all drawing lives in [Widgets]. */
abstract class WakeWidget(private val kind: Widgets.Kind) : AppWidgetProvider() {
    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) = Widgets.update(context, mgr, kind, ids)
    override fun onEnabled(context: Context) = Widgets.refreshAll(context)
}

class DigitalWidget : WakeWidget(Widgets.Kind.DIGITAL)
class AnalogWidget : WakeWidget(Widgets.Kind.ANALOG)
class WorldWidget : WakeWidget(Widgets.Kind.WORLD)
class AlarmWidget : WakeWidget(Widgets.Kind.ALARM)
class TimerWidget : WakeWidget(Widgets.Kind.TIMER)
class CountdownWidget : WakeWidget(Widgets.Kind.COUNTDOWN)

/** Nap buttons and the midnight redraw. */
class WidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Widgets.ACTION_MIDNIGHT -> Widgets.refreshAll(context)
            Widgets.ACTION_NAP -> nap(context, intent.getIntExtra(Widgets.EXTRA_MIN, 0))
        }
    }

    /**
     * Same nap alarm as the Alarm tab's chips (web `oneShotAlarm`): rings once, deletes itself,
     * easy math, no wake-check. Native owns alarms (D2), so it is created here directly. Checks
     * permissions first and says what to fix instead of failing silently (rule 5).
     */
    private fun nap(ctx: Context, minutes: Int) {
        if (minutes !in setOf(10, 30, 60)) return
        if (!AlarmScheduler.canScheduleExact(ctx) || !RingService.notificationsAllowed(ctx)) {
            Toast.makeText(ctx, "Epoch can't set alarms yet. Open Epoch → Settings → Reliability.", Toast.LENGTH_LONG).show()
            return
        }
        val now = System.currentTimeMillis()
        val at = now + minutes * 60_000L
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = at }
        val json = JSONObject()
            .put("hour", cal.get(java.util.Calendar.HOUR_OF_DAY)).put("minute", cal.get(java.util.Calendar.MINUTE))
            .put("days", org.json.JSONArray()).put("label", "Nap").put("enabled", true)
            .put("soundId", "gentle_bells").put("vibrate", true).put("volume", 0.8).put("rampSec", 30)
            .put("snooze", JSONObject().put("lengthMin", 5).put("max", 3).put("shrink", true).put("weeklyBudget", JSONObject.NULL))
            .put("challenge", JSONObject().put("chain", org.json.JSONArray().put("math")).put("level", 1).put("qrPayload", JSONObject.NULL))
            .put("wakeCheck", JSONObject().put("enabled", false).put("delayMin", 4).put("windowSec", 60))
            .put("sunriseMin", 0).put("deleteAfterUse", true).put("skipNext", false).put("oneShotAt", at)
        try {
            AlarmScheduler.refresh(ctx, Alarm.fromJson(json, null, now)) // store first, then schedule (rule 4)
            AlarmPlugin.emit("alarmsChanged", JSONObject())
            val t = android.text.format.DateFormat.getTimeFormat(ctx).format(at)
            Toast.makeText(ctx, "Nap alarm at $t", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(ctx, "Could not set the nap alarm: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
