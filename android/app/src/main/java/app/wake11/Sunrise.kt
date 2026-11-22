package app.wake11

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager

/**
 * Sunrise pre-alarm (BLUEPRINT §5.5): [Alarm.sunriseMin] minutes before an alarm, a silent
 * full-screen glow brightens from dark red to white. Scheduled next to the alarm by
 * [AlarmScheduler.refresh]; cancelled with it. Exact but not an "alarm clock" entry, so the
 * status bar keeps showing the real alarm time.
 */
object Sunrise {
    private const val ACTION = "app.wake11.SUNRISE"
    const val EXTRA_ID = "alarmId"
    const val EXTRA_END = "endAt"
    const val EXTRA_START = "startAt"
    private const val CHANNEL = "sunrise"
    private const val NOTIF_ID = 7301

    private fun code(id: String) = (id.hashCode() and 0x3fffffff) or 0x40000000

    private fun pending(ctx: Context, id: String, endAt: Long, create: Boolean): PendingIntent? {
        val intent = Intent(ctx, SunriseReceiver::class.java).setAction(ACTION)
            .putExtra(EXTRA_ID, id).putExtra(EXTRA_END, endAt)
        val flags = PendingIntent.FLAG_IMMUTABLE or if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE
        return PendingIntent.getBroadcast(ctx, code(id), intent, flags)
    }

    /** Schedules (or cancels) the glow for this alarm's next trigger. */
    fun sync(ctx: Context, alarm: Alarm, now: Long = System.currentTimeMillis()) {
        val fireAt = alarm.nextTriggerAt
        val startAt = fireAt?.minus(alarm.sunriseMin * 60_000L)
        if (fireAt == null || alarm.sunriseMin <= 0 || startAt == null || fireAt <= now + 60_000) {
            cancel(ctx, alarm.id)
            return
        }
        if (!AlarmScheduler.canScheduleExact(ctx)) throw ExactAlarmDeniedException()
        // Set less than the full time ahead? Start right away with a shorter glow.
        val at = maxOf(startAt, now + 1_000)
        ctx.getSystemService(AlarmManager::class.java)
            .setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx, alarm.id, fireAt, true)!!)
    }

    fun cancel(ctx: Context, id: String) {
        pending(ctx, id, 0, false)?.let {
            ctx.getSystemService(AlarmManager::class.java).cancel(it)
            it.cancel()
        }
    }

    /** Opens the glow over the lock screen through a silent full-screen notification. */
    fun show(ctx: Context, alarmId: String, startAt: Long, endAt: Long) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sunrise pre-alarm", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Silent light before an alarm"
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            })
        }
        val open = Intent(ctx, SunriseActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
            .putExtra(EXTRA_ID, alarmId).putExtra(EXTRA_START, startAt).putExtra(EXTRA_END, endAt)
        val pi = PendingIntent.getActivity(ctx, NOTIF_ID, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_wake11)
            .setContentTitle("Sunrise")
            .setContentText("Your alarm rings soon")
            .setCategory(Notification.CATEGORY_ALARM)
            .setFullScreenIntent(pi, true)
            .setContentIntent(pi)
            .setOngoing(false)
            .setAutoCancel(true)
            .setTimeoutAfter(maxOf(1_000L, endAt - System.currentTimeMillis()))
            .build()
        nm.notify(NOTIF_ID, n)
    }

    fun clearNotification(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).cancel(NOTIF_ID)
}

class SunriseReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(Sunrise.EXTRA_ID) ?: return
        val endAt = intent.getLongExtra(Sunrise.EXTRA_END, 0L)
        val now = System.currentTimeMillis()
        val store = AlarmStore(context)
        val alarm = store.get(id) ?: return
        // Only for the trigger it was planned for, and never while another alarm rings or snoozes.
        if (!alarm.enabled || alarm.nextTriggerAt != endAt || endAt <= now || store.ringState() != null) return
        context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wake11:sunrise").acquire(5_000)
        Sunrise.show(context, id, endAt - alarm.sunriseMin * 60_000L, endAt)
    }
}
