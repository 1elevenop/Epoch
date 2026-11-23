package app.wake11

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Anti-snooze escalation (BLUEPRINT §5.2). Pure functions — unit tested in EscalationTest.
 *
 * | snoozes so far | next snooze length   | challenge level | volume              |
 * | 0 (first ring) | base                 | base            | ramp rampSec        |
 * | 1              | 60 % of base (shrink)| base + 1        | ramp 10 s           |
 * | 2              | locked (shrink)      | base + 2        | starts at target    |
 * | escalated      | locked               | 4               | max                 |
 */
object Escalation {
    const val SHRINK_CAP = 2

    data class Profile(val rampSec: Int, val volume: Double)

    /** How many snoozes this alarm allows in total. */
    fun snoozeCap(max: Int, shrink: Boolean): Int = if (shrink) min(max, SHRINK_CAP) else max

    /** Length in minutes of the snooze that is about to start (1-based index). */
    fun snoozeLengthMin(base: Int, index: Int, shrink: Boolean): Int =
        if (shrink && index >= 2) max(1, (base * 0.6).roundToInt()) else base

    fun challengeLevel(base: Int, snoozeCount: Int, escalated: Boolean): Int =
        min(4, max(1, base) + if (escalated) 1 else snoozeCount)

    fun ringProfile(snoozeCount: Int, rampSec: Int, volume: Double, escalated: Boolean): Profile = when {
        escalated || snoozeCount >= 3 -> Profile(0, 1.0)
        snoozeCount == 2 -> Profile(0, volume)
        snoozeCount == 1 -> Profile(min(rampSec, 10), volume)
        else -> Profile(rampSec, volume)
    }

    /** Snoozes left this week, or null when the weekly budget is off. */
    fun budgetLeft(weeklyBudget: Int?, usedThisWeek: Int): Int? =
        weeklyBudget?.let { max(0, it - usedThisWeek) }

    data class SnoozeCheck(val allowed: Boolean, val left: Int, val reason: String?)

    fun canSnooze(snoozeCount: Int, max: Int, shrink: Boolean, escalated: Boolean, budgetLeft: Int?): SnoozeCheck {
        val cap = snoozeCap(max, shrink)
        val leftByCap = max(0, cap - snoozeCount)
        val left = if (budgetLeft == null) leftByCap else min(leftByCap, budgetLeft)
        return when {
            escalated -> SnoozeCheck(false, 0, "locked")
            leftByCap == 0 -> SnoozeCheck(false, 0, "locked")
            budgetLeft != null && budgetLeft <= 0 -> SnoozeCheck(false, 0, "budget")
            else -> SnoozeCheck(true, left, null)
        }
    }
}
