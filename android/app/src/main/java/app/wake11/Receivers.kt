package app.wake11

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager

/** Fires when an alarm time is reached. Takes a short wake lock, stores state, starts RingService. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
        val wl = context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wake11:alarm")
        wl.acquire(10_000)
        RingController.fire(
            context, id,
            resume = intent.action == AlarmScheduler.ACTION_RESUME,
            queued = intent.getBooleanExtra(AlarmScheduler.EXTRA_QUEUED, false),
        )
    }
}

/**
 * Boot / app update: alarms were erased, so re-schedule everything. Never starts the ring service
 * here (Android 15 blocks mediaPlayback FGS from BOOT_COMPLETED). A ring cut off by power-off
 * (< 60 min ago) is resumed through a new exact alarm 5 s later (BLUEPRINT §3, §5.2).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val now = System.currentTimeMillis()
        AlarmScheduler.rescheduleAll(context, now)
        TimerAlarms.rescheduleAll(context, now)
        val store = AlarmStore(context)
        val rs = store.ringState() ?: return
        val due = rs.phase == RingState.RINGING || (rs.nextRingAt != null && rs.nextRingAt <= now)
        if (!due) return
        if (now - rs.firstRangAt > 60 * 60_000L) {
            RingController.logOutcome(context, rs, "killed", now)
            store.setRingState(null)
            return
        }
        val at = now + 5_000
        store.setRingState(rs.copy(phase = RingState.SNOOZED, nextRingAt = at))
        try { AlarmScheduler.scheduleResume(context, rs.alarmId, at) } catch (_: SecurityException) { }
    }
}

/** System time or timezone changed: recompute every next trigger from the rule. */
class TimeChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        AlarmScheduler.rescheduleAll(context)
        AlarmPlugin.emit("alarmsChanged", org.json.JSONObject())
    }
}
