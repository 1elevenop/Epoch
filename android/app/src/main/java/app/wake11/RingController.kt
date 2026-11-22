package app.wake11

import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.util.UUID

/**
 * Ring state machine (BLUEPRINT §5.1): SCHEDULED → RINGING → SNOOZED → RINGING …
 * → DISMISSED → (wake-check) → DONE. State is stored before each side effect (rule 4).
 */
object RingController {
    var onRingStopped: ((alarmId: String, reason: String) -> Unit)? = null

    private const val WEEK_MS = 7 * 24 * 3600_000L
    private val BUSY = setOf(RingState.RINGING, RingState.WAKE_CHECK_PROMPT)

    /** An alarm fired (or resumed). Decide whether it rings now or waits in the queue. */
    fun fire(ctx: Context, alarmId: String, resume: Boolean, queued: Boolean, now: Long = System.currentTimeMillis()) {
        val store = AlarmStore(ctx)
        val alarm = store.get(alarmId) ?: run {
            store.setQueue(store.queue() - alarmId) // deleted while waiting in the queue
            return
        }
        val current = store.ringState()
        // The real alarm takes over from the sunrise glow.
        Sunrise.clearNotification(ctx)
        SunriseActivity.current?.let { it.runOnUiThread { it.finish() } }

        if (!resume) afterRegularFire(ctx, alarm, now)

        if (current != null && current.phase in BUSY && current.alarmId != alarmId) {
            store.setQueue(store.queue() + alarmId) // only one alarm rings at a time
            return
        }
        if (queued) store.setQueue(store.queue() - alarmId)
        if (current?.phase == RingState.WAKE_CHECK_PENDING && current.alarmId != alarmId) {
            WakeCheck.cancel(ctx, current, "off") // a new alarm replaces a pending wake-check
        }

        val state = if (resume && !queued && current?.alarmId == alarmId && current.phase == RingState.SNOOZED) {
            current.copy(
                phase = RingState.RINGING,
                nextRingAt = null,
                challengeLevel = Escalation.challengeLevel(alarm.challengeLevel, current.snoozeCount, current.escalated),
            )
        } else if (resume && !queued && current?.alarmId == alarmId && current.phase == RingState.RINGING) {
            current // reboot resume of a ring that was cut off
        } else {
            RingState(
                alarmId, UUID.randomUUID().toString(), RingState.RINGING, now, alarm.nextTriggerAt ?: now,
                0, null, Escalation.challengeLevel(alarm.challengeLevel, 0, false),
            )
        }
        startRinging(ctx, state)
    }

    fun startRinging(ctx: Context, state: RingState) {
        AlarmStore(ctx).setRingState(state)
        ctx.startForegroundService(Intent(ctx, RingService::class.java).setAction(RingService.ACTION_START))
        openRingScreen(ctx)
    }

    /**
     * Backup to the full-screen notification: open the ring screen directly. Android allows this when
     * WAKE11 is in the foreground; if blocked, the call is dropped and the notification still applies.
     */
    fun openRingScreen(ctx: Context) {
        try {
            ctx.startActivity(
                Intent(ctx, RingActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
            )
        } catch (e: Exception) {
            android.util.Log.w("WAKE11", "Direct ring screen start blocked: ${e.message}")
        }
    }

    /** Repeating alarms are rescheduled at once; one-time alarms switch off (deleted on dismiss if asked). */
    private fun afterRegularFire(ctx: Context, alarm: Alarm, now: Long) {
        val next = if (alarm.isRepeating) alarm.copy(skipNext = false) else alarm.copy(enabled = false, oneShotAt = null)
        try {
            AlarmScheduler.refresh(ctx, next, now + 1000)
        } catch (e: SecurityException) {
            AlarmStore(ctx).put(next.copy(nextTriggerAt = null))
        }
        AlarmPlugin.emit("alarmsChanged", JSONObject())
    }

    /** What the ring screen needs to draw itself. */
    fun context(ctx: Context, now: Long = System.currentTimeMillis()): JSONObject? {
        val store = AlarmStore(ctx)
        val rs = store.ringState() ?: return null
        val alarm = store.get(rs.alarmId) ?: return null
        val budget = Escalation.budgetLeft(alarm.weeklyBudget, store.snoozesSince(now - WEEK_MS) + rs.snoozeCount)
        val check = Escalation.canSnooze(rs.snoozeCount, alarm.snoozeMax, alarm.shrink, rs.escalated, budget)
        return JSONObject()
            .put("state", rs.toJson())
            .put("alarm", alarm.toJson())
            .put("snoozeAllowed", check.allowed)
            .put("snoozesLeft", check.left)
            .put("snoozeLockReason", check.reason ?: JSONObject.NULL)
            .put("budgetLeft", budget ?: JSONObject.NULL)
            .put("nextSnoozeMin", Escalation.snoozeLengthMin(alarm.snoozeLengthMin, rs.snoozeCount + 1, alarm.shrink))
    }

    data class SnoozeResult(val allowed: Boolean, val nextRingAt: Long?, val snoozesLeft: Int)

    fun snooze(ctx: Context, alarmId: String, now: Long = System.currentTimeMillis()): SnoozeResult {
        val store = AlarmStore(ctx)
        val rs = store.ringState()
        val alarm = store.get(alarmId)
        if (rs == null || rs.alarmId != alarmId || rs.phase != RingState.RINGING || alarm == null) {
            return SnoozeResult(false, null, 0)
        }
        val budget = Escalation.budgetLeft(alarm.weeklyBudget, store.snoozesSince(now - WEEK_MS) + rs.snoozeCount)
        val check = Escalation.canSnooze(rs.snoozeCount, alarm.snoozeMax, alarm.shrink, rs.escalated, budget)
        if (!check.allowed) return SnoozeResult(false, null, 0)
        val count = rs.snoozeCount + 1
        val next = now + Escalation.snoozeLengthMin(alarm.snoozeLengthMin, count, alarm.shrink) * 60_000L
        store.setRingState(rs.copy(phase = RingState.SNOOZED, snoozeCount = count, nextRingAt = next))
        AlarmScheduler.scheduleResume(ctx, alarmId, next)
        stopRinging(alarmId, "snoozed")
        return SnoozeResult(true, next, check.left - 1)
    }

    /** Challenge solved. Starts the wake-check if the alarm has one, otherwise finishes. */
    fun dismiss(ctx: Context, alarmId: String, outcome: String = "dismissed", fails: Int = 0, now: Long = System.currentTimeMillis()) {
        val store = AlarmStore(ctx)
        val rs = store.ringState()
        if (rs == null || rs.alarmId != alarmId || rs.phase !in setOf(RingState.RINGING, RingState.SNOOZED)) return
        val alarm = store.get(alarmId)
        val withFails = rs.copy(challengeFails = rs.challengeFails + fails)
        AlarmScheduler.cancelResume(ctx, alarmId)
        val wakeCheck = outcome == "dismissed" && alarm != null && alarm.wakeCheckEnabled && !rs.escalated

        if (rs.escalated) {
            store.updateLog(
                rs.instanceId,
                JSONObject().put("outcome", outcome).put("dismissedAt", if (outcome == "dismissed") now else JSONObject.NULL)
                    .put("challengeFails", withFails.challengeFails),
            )
        } else {
            logOutcome(ctx, withFails, outcome, now, if (wakeCheck) "pending" else "off")
        }
        if (wakeCheck) {
            WakeCheck.start(ctx, withFails, alarm!!, now)
        } else {
            store.setRingState(null)
            finishInstance(ctx, alarmId)
        }
        stopRinging(alarmId, outcome)
        if (!wakeCheck) playNextQueued(ctx, now)
    }

    /** One-time alarms marked "delete after use" go away once the instance is fully done. */
    fun finishInstance(ctx: Context, alarmId: String) {
        val store = AlarmStore(ctx)
        store.get(alarmId)?.let { a ->
            if (a.deleteAfterUse && !a.isRepeating && !a.enabled) {
                store.delete(a.id)
                AlarmScheduler.cancel(ctx, a.id)
            }
        }
        AlarmPlugin.emit("alarmsChanged", JSONObject())
    }

    fun stopRinging(alarmId: String, reason: String) {
        RingService.running?.shutdown()
        onRingStopped?.invoke(alarmId, reason)
        AlarmPlugin.emit("ringStopped", JSONObject().put("alarmId", alarmId).put("reason", reason))
    }

    /** A queued alarm rings 1 minute after the current one is done (BLUEPRINT §5.1). */
    fun playNextQueued(ctx: Context, now: Long) {
        // The id stays in the queue until it actually rings, so a reboot/update can re-schedule it.
        val id = AlarmStore(ctx).queue().firstOrNull() ?: return
        try { AlarmScheduler.scheduleResume(ctx, id, now + 60_000, queued = true) } catch (e: SecurityException) { }
    }

    fun logOutcome(ctx: Context, rs: RingState, outcome: String, now: Long, wakeCheck: String = "off") {
        val store = AlarmStore(ctx)
        val alarm = store.get(rs.alarmId)
        store.appendLog(
            JSONObject()
                .put("instanceId", rs.instanceId).put("alarmId", rs.alarmId)
                .put("label", alarm?.label ?: "")
                .put("scheduledFor", rs.scheduledFor).put("firstRangAt", rs.firstRangAt)
                .put("dismissedAt", if (outcome == "dismissed") now else JSONObject.NULL)
                .put("snoozes", rs.snoozeCount).put("challengeFails", rs.challengeFails).put("wakeCheck", wakeCheck)
                .put("outcome", outcome),
        )
    }
}
