package com.eonpay.deviceagent.data

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class PolicyTimeTest {
    @Test
    fun parsesIsoTimestamp() {
        assertEquals(
            Instant.parse("2026-07-24T12:30:00Z"),
            PolicyTime.parse("2026-07-24T12:30:00Z"),
        )
    }

    @Test
    fun parsesUnixSeconds() {
        assertEquals(Instant.ofEpochSecond(1_700_000_000), PolicyTime.parse("1700000000"))
    }

    @Test
    fun parsesUnixMilliseconds() {
        assertEquals(Instant.ofEpochMilli(1_700_000_000_123), PolicyTime.parse("1700000000123"))
    }
}
