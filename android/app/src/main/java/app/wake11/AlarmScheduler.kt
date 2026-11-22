package app.wake11

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

class ExactAlarmDeniedException : SecurityException("Exact alarm permission is not granted")

/** Wraps AlarmManager.setAlarmClock() (decision D4). Store is always written before scheduling. */
object AlarmScheduler {
    const val ACTION_FIRE = "app.wake11.FIRE" // regular trigger of an alarm
    const val ACTION_RESUME = "app.wake11.RESUME" // snooze end, reboot resume, queued ring
    const val EXTRA_ID = "alarmId"
    const val EXTRA_QUEUED = "queued"

    fun canScheduleExact(ctx: Context): Boolean {
        val am = ctx.getSystemService(AlarmManager::class.java)
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    }

    private fun code(id: String, resume: Boolean) = (id.hashCode() and 0x3fffffff) * 2 + if (resume) 1 else 0

    private fun pending(ctx: Context, id: String, resume: Boolean, queued: Boolean = false, create: Boolean = true): PendingIntent? {
        val intent = Intent(ctx, AlarmReceiver::class.java)
            .setAction(if (resume) ACTION_RESUME else ACTION_FIRE)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_QUEUED, queued)
        val flags = PendingIntent.FLAG_IMMUTABLE or if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE
        return PendingIntent.getBroadcast(ctx, code(id, resume), intent, flags)
    }

    private fun setClock(ctx: Context, at: Long, op: PendingIntent) {
        if (!canScheduleExact(ctx)) throw ExactAlarmDeniedException()
        val show = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        ctx.getSystemService(AlarmManager::class.java).setAlarmClock(AlarmManager.AlarmClockInfo(at, show), op)
    }

    /** Recompute nextTriggerAt, store it, then (re)schedule or cancel. Returns the stored alarm. */
    fun refresh(ctx: Context, alarm: Alarm, now: Long = System.currentTimeMillis()): Alarm {
        val store = AlarmStore(ctx)
        val next = NextTrigger.forAlarm(alarm, now)
        val updated = alarm.copy(nextTriggerAt = next)
        store.put(updated)
        if (next == null) cancel(ctx, alarm.id) else setClock(ctx, next, pending(ctx, alarm.id, false)!!)
        Sunrise.sync(ctx, updated, now)
        return updated
    }

    /** Ring this alarm again at [at] (snooze end, reboot resume, queued alarm). */
    fun scheduleResume(ctx: Context, id: String, at: Long, queued: Boolean = false) {
        setClock(ctx, at, pending(ctx, id, true, queued)!!)
    }

    fun cancel(ctx: Context, id: String) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        pending(ctx, id, false, create = false)?.let { am.cancel(it); it.cancel() }
        Sunrise.cancel(ctx, id)
    }

    fun cancelResume(ctx: Context, id: String) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        pending(ctx, id, true, create = false)?.let { am.cancel(it); it.cancel() }
    }

    /** After boot, app update, time or timezone change: rebuild every schedule from stored state. */
    fun rescheduleAll(ctx: Context, now: Long = System.currentTimeMillis()) {
        val store = AlarmStore(ctx)
        for (a in store.all()) {
            try { refresh(ctx, a, now) } catch (e: SecurityException) { /* reported by the Reliability screen */ }
        }
        val rs = store.ringState()
        if (rs == null) {
            // A queued alarm whose pending ring was lost (reboot, app update): ring it shortly.
            store.queue().firstOrNull()?.let { id ->
                try { scheduleResume(ctx, id, now + 5_000, queued = true) } catch (e: SecurityException) { }
            }
            return
        }
        if (rs.phase == RingState.WAKE_CHECK_PENDING || rs.phase == RingState.WAKE_CHECK_PROMPT) {
            WakeCheck.reschedule(ctx, rs, now)
            return
        }
        if (rs.phase == RingState.SNOOZED && rs.nextRingAt != null && rs.nextRingAt > now) {
            try { scheduleResume(ctx, rs.alarmId, rs.nextRingAt) } catch (e: SecurityException) { }
        }
    }
}
