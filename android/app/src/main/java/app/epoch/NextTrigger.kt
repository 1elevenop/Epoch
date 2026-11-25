package app.epoch

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Next ring time, computed from the rule in local wall-clock time — never "+24 h" —
 * so DST and timezone changes are handled (BLUEPRINT §5.1). Pure: no Android APIs.
 *
 * days: 0=Sun..6=Sat, empty = one-time (next occurrence of hour:minute).
 */
object NextTrigger {
    fun compute(
        hour: Int,
        minute: Int,
        days: Collection<Int>,
        skipNext: Boolean,
        oneShotAt: Long?,
        now: Long,
        zone: ZoneId = ZoneId.systemDefault(),
    ): Long? {
        if (oneShotAt != null) return if (oneShotAt > now) oneShotAt else null
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        var skipped = !skipNext
        for (offset in 0L..14L) {
            val date = today.plusDays(offset)
            // atZone resolves a DST gap by moving forward and an overlap to the earlier offset.
            val at: ZonedDateTime = date.atTime(hour, minute).atZone(zone)
            val ms = at.toInstant().toEpochMilli()
            if (ms <= now) continue
            val dow = date.dayOfWeek.value % 7 // Monday=1..Sunday=7 → Sunday=0
            if (days.isNotEmpty() && dow !in days) continue
            if (!skipped) {
                skipped = true
                continue
            }
            return ms
        }
        return null
    }

    fun forAlarm(a: Alarm, now: Long, zone: ZoneId = ZoneId.systemDefault()): Long? =
        if (!a.enabled) null else compute(a.hour, a.minute, a.days, a.skipNext, a.oneShotAt, now, zone)
}
