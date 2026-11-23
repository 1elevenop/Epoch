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
import org.json.JSONObject

/**
 * Timers that must ring when the app is closed (BLUEPRINT §6.3, focus phase ends §6.5).
 * The web layer owns timer UI state; native keeps only running timers {id, endAt, label}
 * and rings at endAt with setAlarmClock (D4). Store before side effects (rule 4).
 */
object TimerAlarms {
    const val ACTION_FIRE = "app.wake11.TIMER_FIRE"
    const val EXTRA_ID = "timerId"
    private const val PREFS = "wake_timers"
    private const val RUNNING_CHANNEL = "timers_running"
    private const val RUNNING_NOTIF = 4720

    /** label: shown when it rings. title: shown while it runs (widget, ongoing notification); falls back to label. */
    data class T(val id: String, val endAt: Long, val label: String, val title: String = "") {
        fun runningName(): String = title.ifBlank { label.ifBlank { "Timer" } }
    }

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Sound for finished timers (Settings → Timer sound). Native keeps its own copy so it rings with the app closed. */
    fun sound(ctx: Context): String = prefs(ctx).getString("sound", null)?.takeIf { it in Alarm.SOUNDS } ?: "hard_classic"

    fun setSound(ctx: Context, id: String) {
        if (id !in Alarm.SOUNDS) throw IllegalArgumentException("unknown soundId $id")
        prefs(ctx).edit().putString("sound", id).apply()
    }

    @Synchronized
    fun all(ctx: Context): List<T> {
        val o = JSONObject(prefs(ctx).getString("timers", "{}") ?: "{}")
        return o.keys().asSequence().map { k ->
            val t = o.getJSONObject(k)
            T(k, t.getLong("endAt"), t.optString("label"), t.optString("title"))
        }.toList()
    }

    @Synchronized
    private fun save(ctx: Context, list: List<T>) {
        val o = JSONObject()
        list.forEach { o.put(it.id, JSONObject().put("endAt", it.endAt).put("label", it.label).put("title", it.title)) }
        prefs(ctx).edit().putString("timers", o.toString()).commit()
        Widgets.refreshAll(ctx)
    }

    fun schedule(ctx: Context, id: String, endAt: Long, label: String, title: String = "") {
        require(id.isNotBlank() && id.length <= 64) { "timer id must be 1..64 chars" }
        require(endAt > 0) { "endAt is required" }
        if (!AlarmScheduler.canScheduleExact(ctx)) throw ExactAlarmDeniedException()
        save(ctx, all(ctx).filter { it.id != id } + T(id, endAt, label.take(60), title.take(60)))
        setClock(ctx, id, endAt)
        updateRunningNotification(ctx)
    }

    fun cancel(ctx: Context, id: String) {
        save(ctx, all(ctx).filter { it.id != id })
        pending(ctx, id, PendingIntent.FLAG_NO_CREATE)?.let {
            ctx.getSystemService(AlarmManager::class.java).cancel(it)
            it.cancel()
        }
        TimerRingService.stop(id)
        updateRunningNotification(ctx)
    }

    /** endAt reached: drop it from the running list and ring. */
    fun fire(ctx: Context, id: String) {
        val t = all(ctx).firstOrNull { it.id == id } ?: return
        save(ctx, all(ctx).filter { it.id != id })
        updateRunningNotification(ctx)
        TimerRingService.start(ctx, t.id, t.label)
        AlarmPlugin.emit("timerDone", JSONObject().put("id", t.id).put("label", t.label))
    }

    /** After boot / update: re-schedule; anything that ended while the phone was off rings now. */
    fun rescheduleAll(ctx: Context, now: Long = System.currentTimeMillis()) {
        for (t in all(ctx)) {
            try { setClock(ctx, t.id, maxOf(t.endAt, now + 5_000)) } catch (_: SecurityException) { }
        }
        updateRunningNotification(ctx)
    }

    private fun pending(ctx: Context, id: String, flags: Int = PendingIntent.FLAG_UPDATE_CURRENT) =
        PendingIntent.getBroadcast(
            ctx, ("timer:$id").hashCode(),
            Intent(ctx, TimerReceiver::class.java).setAction(ACTION_FIRE).putExtra(EXTRA_ID, id),
            PendingIntent.FLAG_IMMUTABLE or flags,
        )

    private fun setClock(ctx: Context, id: String, at: Long) {
        val show = PendingIntent.getActivity(
            ctx, 3, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        ctx.getSystemService(AlarmManager::class.java)
            .setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pending(ctx, id)!!)
    }

    /** Ongoing notification with a live count-down (native Chronometer) to the next timer. */
    fun updateRunningNotification(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val next = all(ctx).minByOrNull { it.endAt }
        if (next == null) {
            nm.cancel(RUNNING_NOTIF)
            return
        }
        if (nm.getNotificationChannel(RUNNING_CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(RUNNING_CHANNEL, "Running timers", NotificationManager.IMPORTANCE_LOW).apply {
                    setShowBadge(false)
                },
            )
        }
        val open = PendingIntent.getActivity(
            ctx, 4, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val count = all(ctx).size
        val n = Notification.Builder(ctx, RUNNING_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_wake11)
            .setContentTitle(next.runningName() + if (count > 1) " (+${count - 1} more)" else "")
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(next.endAt)
            .setShowWhen(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .build()
        nm.notify(RUNNING_NOTIF, n)
    }
}

class TimerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(TimerAlarms.EXTRA_ID) ?: return
        context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wake11:timer").acquire(10_000)
        TimerAlarms.fire(context, id)
    }
}
