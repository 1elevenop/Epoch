package app.wake11

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import org.json.JSONObject

/**
 * Wake-up check (BLUEPRINT §5.4): N minutes after dismiss, a full-screen "Are you up?" prompt.
 * Tap ✓ within the window → passed. No tap → ring again, escalated (snooze locked, level 4, max volume).
 */
object WakeCheck {
    const val ACTION_PROMPT = "app.wake11.WAKE_CHECK_PROMPT"
    const val ACTION_TIMEOUT = "app.wake11.WAKE_CHECK_TIMEOUT"
    const val ACTION_CONFIRM = "app.wake11.WAKE_CHECK_CONFIRM"
    const val ACTION_REPOST = "app.wake11.WAKE_CHECK_REPOST"
    private const val NOTIF_ID = 4712

    fun start(ctx: Context, rs: RingState, alarm: Alarm, now: Long) {
        val at = now + alarm.wakeCheckDelayMin * 60_000L
        val pendingState = rs.copy(phase = RingState.WAKE_CHECK_PENDING, wakeCheckAt = at, nextRingAt = null)
        AlarmStore(ctx).setRingState(pendingState)
        try {
            schedule(ctx, ACTION_PROMPT, at)
        } catch (e: SecurityException) {
            cancel(ctx, pendingState, "off") // cannot schedule the check: end cleanly instead of hanging
        }
    }

    /** After reboot / app update: the check's pending alarms were erased; put them back. */
    fun reschedule(ctx: Context, rs: RingState, now: Long) {
        val at = maxOf(rs.wakeCheckAt ?: now, now + 5_000)
        try {
            when (rs.phase) {
                RingState.WAKE_CHECK_PENDING -> schedule(ctx, ACTION_PROMPT, at)
                RingState.WAKE_CHECK_PROMPT -> schedule(ctx, ACTION_TIMEOUT, at)
            }
        } catch (_: SecurityException) { }
    }

    /** Delay over: show the prompt and start the answer window. */
    fun prompt(ctx: Context, now: Long = System.currentTimeMillis()) {
        val store = AlarmStore(ctx)
        val rs = store.ringState() ?: return
        if (rs.phase != RingState.WAKE_CHECK_PENDING) return
        val alarm = store.get(rs.alarmId)
        val until = now + (alarm?.wakeCheckWindowSec ?: 60) * 1000L
        store.setRingState(rs.copy(phase = RingState.WAKE_CHECK_PROMPT, wakeCheckAt = until))
        schedule(ctx, ACTION_TIMEOUT, until)
        showPrompt(ctx, alarm?.wakeCheckWindowSec ?: 60)
        RingController.openRingScreen(ctx)
        AlarmPlugin.emit("ringStarted", store.ringState()!!.toJson())
    }

    /** Prompt notification swiped away (Android 14+ allows it even when ongoing): put it straight back. */
    fun repost(ctx: Context, now: Long = System.currentTimeMillis()) {
        val rs = AlarmStore(ctx).ringState() ?: return
        if (rs.phase != RingState.WAKE_CHECK_PROMPT) return
        val left = (((rs.wakeCheckAt ?: now) - now) / 1000).toInt().coerceAtLeast(1)
        showPrompt(ctx, left)
    }

    fun confirm(ctx: Context): Boolean {
        val store = AlarmStore(ctx)
        val rs = store.ringState() ?: return false
        if (rs.phase != RingState.WAKE_CHECK_PROMPT && rs.phase != RingState.WAKE_CHECK_PENDING) return false
        cancel(ctx, rs, "passed")
        return true
    }

    /** Window over with no answer: ring again with snooze locked. */
    fun timeout(ctx: Context, now: Long = System.currentTimeMillis()) {
        val store = AlarmStore(ctx)
        val rs = store.ringState() ?: return
        if (rs.phase != RingState.WAKE_CHECK_PROMPT) return
        cancelAlarm(ctx, ACTION_REPOST)
        dismissPrompt(ctx)
        store.updateLog(rs.instanceId, JSONObject().put("wakeCheck", "failed"))
        RingController.startRinging(
            ctx,
            rs.copy(phase = RingState.RINGING, escalated = true, wakeCheckAt = null, nextRingAt = null,
                challengeLevel = Escalation.challengeLevel(store.get(rs.alarmId)?.challengeLevel ?: 1, 0, true)),
        )
    }

    /** Ends the wake-check with [result] ("passed" / "off") and clears the instance. */
    fun cancel(ctx: Context, rs: RingState, result: String) {
        val store = AlarmStore(ctx)
        cancelAlarm(ctx, ACTION_PROMPT)
        cancelAlarm(ctx, ACTION_TIMEOUT)
        cancelAlarm(ctx, ACTION_REPOST)
        dismissPrompt(ctx)
        store.updateLog(rs.instanceId, JSONObject().put("wakeCheck", result))
        store.setRingState(null)
        RingController.finishInstance(ctx, rs.alarmId)
        RingController.stopRinging(rs.alarmId, "wake_check_$result")
        RingController.playNextQueued(ctx, System.currentTimeMillis())
    }

    private fun pending(ctx: Context, action: String, flags: Int = PendingIntent.FLAG_UPDATE_CURRENT) =
        PendingIntent.getBroadcast(
            ctx, action.hashCode(), Intent(ctx, WakeCheckReceiver::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or flags,
        )

    private fun schedule(ctx: Context, action: String, at: Long) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        if (!AlarmScheduler.canScheduleExact(ctx)) throw ExactAlarmDeniedException()
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(ctx, action)!!)
    }

    private fun cancelAlarm(ctx: Context, action: String) {
        pending(ctx, action, PendingIntent.FLAG_NO_CREATE)?.let {
            ctx.getSystemService(AlarmManager::class.java).cancel(it)
            it.cancel()
        }
    }

    private fun showPrompt(ctx: Context, windowSec: Int) {
        RingService.ensureChannel(ctx)
        val open = PendingIntent.getActivity(
            ctx, 2, Intent(ctx, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val confirm = pending(ctx, ACTION_CONFIRM)
        val n = Notification.Builder(ctx, RingService.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_wake11)
            .setContentTitle("Are you up?")
            .setContentText("Tap ✓ within $windowSec s or the alarm rings again.")
            .setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true)
            .setContentIntent(open)
            .setDeleteIntent(pending(ctx, ACTION_REPOST))
            .setFullScreenIntent(open, true)
            .addAction(Notification.Action.Builder(null, "✓ I'm up", confirm).build())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(NOTIF_ID, n)
        vibrate(ctx)
    }

    private fun dismissPrompt(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).cancel(NOTIF_ID)

    private fun vibrate(ctx: Context) {
        val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ctx.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION") ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 300, 200, 300), -1))
    }
}

class WakeCheckReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wake11:wakecheck").acquire(10_000)
        when (intent.action) {
            WakeCheck.ACTION_PROMPT -> WakeCheck.prompt(context)
            WakeCheck.ACTION_TIMEOUT -> WakeCheck.timeout(context)
            WakeCheck.ACTION_CONFIRM -> WakeCheck.confirm(context)
            WakeCheck.ACTION_REPOST -> WakeCheck.repost(context)
        }
    }
}
