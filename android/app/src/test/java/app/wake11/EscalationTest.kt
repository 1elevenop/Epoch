package app.wake11

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EscalationTest {
    @Test fun snoozeLengthsAre5Then3() {
        assertEquals(5, Escalation.snoozeLengthMin(5, 1, shrink = true))
        assertEquals(3, Escalation.snoozeLengthMin(5, 2, shrink = true))
        assertEquals(5, Escalation.snoozeLengthMin(5, 2, shrink = false))
        assertEquals(1, Escalation.snoozeLengthMin(1, 2, shrink = true))
    }

    @Test fun thirdSnoozeIsLocked() {
        assertTrue(Escalation.canSnooze(0, 3, true, false, null).allowed)
        assertTrue(Escalation.canSnooze(1, 3, true, false, null).allowed)
        val third = Escalation.canSnooze(2, 3, true, false, null)
        assertFalse(third.allowed)
        assertEquals("locked", third.reason)
    }

    @Test fun noShrinkUsesConfiguredMax() {
        assertTrue(Escalation.canSnooze(2, 3, false, false, null).allowed)
        assertFalse(Escalation.canSnooze(3, 3, false, false, null).allowed)
    }

    @Test fun zeroMaxMeansNoSnooze() {
        assertFalse(Escalation.canSnooze(0, 0, true, false, null).allowed)
    }

    @Test fun escalatedIsAlwaysLocked() {
        assertFalse(Escalation.canSnooze(0, 3, true, true, null).allowed)
        // Missed wake-check: one level above the alarm's own, capped at 4.
        assertEquals(2, Escalation.challengeLevel(1, 0, escalated = true))
        assertEquals(4, Escalation.challengeLevel(4, 0, escalated = true))
    }

    @Test fun weeklyBudget() {
        assertNull(Escalation.budgetLeft(null, 10))
        assertEquals(1, Escalation.budgetLeft(3, 2))
        assertEquals(0, Escalation.budgetLeft(3, 5))
        val out = Escalation.canSnooze(0, 3, true, false, 0)
        assertFalse(out.allowed)
        assertEquals("budget", out.reason)
        assertEquals(1, Escalation.canSnooze(0, 3, true, false, 1).left)
    }

    @Test fun challengeGetsHarder() {
        assertEquals(2, Escalation.challengeLevel(2, 0, false))
        assertEquals(3, Escalation.challengeLevel(2, 1, false))
        assertEquals(4, Escalation.challengeLevel(2, 2, false))
        assertEquals(4, Escalation.challengeLevel(3, 5, false))
    }

    @Test fun volumeProfile() {
        assertEquals(Escalation.Profile(30, 0.7), Escalation.ringProfile(0, 30, 0.7, false))
        assertEquals(Escalation.Profile(10, 0.7), Escalation.ringProfile(1, 30, 0.7, false))
        assertEquals(Escalation.Profile(0, 0.7), Escalation.ringProfile(2, 30, 0.7, false))
        assertEquals(Escalation.Profile(0, 1.0), Escalation.ringProfile(0, 30, 0.7, true))
    }
}
