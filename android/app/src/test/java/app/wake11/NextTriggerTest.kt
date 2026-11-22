package app.wake11

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class NextTriggerTest {
    private val india = ZoneId.of("Asia/Kolkata")
    private val london = ZoneId.of("Europe/London")

    private fun ms(zone: ZoneId, y: Int, mo: Int, d: Int, h: Int, mi: Int) =
        LocalDateTime.of(y, mo, d, h, mi).atZone(zone).toInstant().toEpochMilli()

    @Test fun oneTimeLaterToday() {
        val now = ms(india, 2026, 11, 22, 5, 0)
        assertEquals(ms(india, 2026, 11, 22, 6, 30), NextTrigger.compute(6, 30, emptyList(), false, null, now, india))
    }

    @Test fun oneTimeInPastGoesToTomorrow() {
        val now = ms(india, 2026, 11, 22, 8, 0)
        assertEquals(ms(india, 2026, 11, 23, 6, 0), NextTrigger.compute(6, 0, emptyList(), false, null, now, india))
    }

    @Test fun exactlyNowIsNotNow() {
        val now = ms(india, 2026, 11, 22, 6, 0)
        assertEquals(ms(india, 2026, 11, 23, 6, 0), NextTrigger.compute(6, 0, emptyList(), false, null, now, india))
    }

    @Test fun repeatDaysCrossWeekBoundary() {
        // 2026-11-28 is a Saturday; Monday-only alarm → Monday 30th
        val now = ms(india, 2026, 11, 28, 23, 0)
        assertEquals(ms(india, 2026, 11, 30, 6, 30), NextTrigger.compute(6, 30, listOf(1), false, null, now, india))
    }

    @Test fun sundayIsZero() {
        val now = ms(india, 2026, 11, 21, 12, 0) // Saturday
        assertEquals(ms(india, 2026, 11, 22, 7, 0), NextTrigger.compute(7, 0, listOf(0), false, null, now, india))
    }

    @Test fun skipNextJumpsOneOccurrence() {
        val now = ms(india, 2026, 11, 22, 8, 0) // Sunday
        assertEquals(ms(india, 2026, 11, 24, 6, 0), NextTrigger.compute(6, 0, listOf(1, 2), true, null, now, india))
    }

    @Test fun timezoneChangeUsesNewZone() {
        val now = ms(india, 2026, 11, 22, 5, 0)
        val inLondon = NextTrigger.compute(6, 0, emptyList(), false, null, now, london)
        // 05:00 IST = 23:30 London (previous day) → next 06:00 London is the 22nd
        assertEquals(ms(london, 2026, 11, 22, 6, 0), inLondon)
    }

    @Test fun dstSpringForwardGap() {
        // London 2026-03-29 01:00 → 02:00. An alarm at 01:30 that day rings at 02:30 local (gap shifted forward).
        val now = ms(london, 2026, 3, 28, 22, 0)
        val r = NextTrigger.compute(1, 30, emptyList(), false, null, now, london)!!
        assertEquals(LocalDateTime.of(2026, 3, 29, 2, 30), java.time.Instant.ofEpochMilli(r).atZone(london).toLocalDateTime())
    }

    @Test fun dstKeepsWallClockNotPlus24h() {
        val now = ms(london, 2026, 3, 28, 8, 0)
        val r = NextTrigger.compute(7, 0, listOf(0), false, null, now, london)!! // Sunday after the change
        assertEquals(ms(london, 2026, 3, 29, 7, 0), r)
    }

    @Test fun oneShotAt() {
        assertEquals(5000L, NextTrigger.compute(6, 0, emptyList(), false, 5000L, 1000L, india))
        assertNull(NextTrigger.compute(6, 0, emptyList(), false, 500L, 1000L, india))
    }
}
