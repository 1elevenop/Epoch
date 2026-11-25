package app.epoch

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A ring state that can never end must not block later alarms (bug: alarms queued silently for days). */
class StaleRingTest {
    private val now = 1_800_000_000_000L
    private fun rs(phase: String, startedMinAgo: Long) =
        RingState("a", "i", phase, now - startedMinAgo * 60_000L, now - startedMinAgo * 60_000L, 0, null, 1)

    @Test fun ringForDeletedAlarmIsStale() {
        assertTrue(RingController.isStale(rs(RingState.RINGING, 1), alarmExists = false, now = now))
        assertTrue(RingController.isStale(rs(RingState.WAKE_CHECK_PROMPT, 1), alarmExists = false, now = now))
    }

    @Test fun ringOlderThanAnHourIsStale() {
        assertTrue(RingController.isStale(rs(RingState.RINGING, 61), alarmExists = true, now = now))
    }

    @Test fun freshRingOfExistingAlarmIsNotStale() {
        assertFalse(RingController.isStale(rs(RingState.RINGING, 5), alarmExists = true, now = now))
        assertFalse(RingController.isStale(rs(RingState.WAKE_CHECK_PROMPT, 59), alarmExists = true, now = now))
    }
}
