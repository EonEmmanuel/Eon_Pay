package com.eonpay.deviceagent.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class PolicyStateTest {
    private val payload = PolicyPayload(
        deviceId = "device-1",
        tenantId = "tenant-1",
        policyTier = PolicyTier.ACTIVE,
        amountDue = "12500",
        daysOverdue = 2,
        issuedAt = "2026-07-24T12:00:00Z",
        expiresAt = "2026-07-24T13:00:00Z",
    )

    @Test
    fun expiredPolicyFailsSafeToSoftLock() {
        val state = PolicyState.Expired(payload, Instant.parse(payload.expiresAt))
        assertEquals(PolicyTier.SOFT_LOCK, state.effectiveTier)
        assertEquals(payload, state.payloadOrNull)
    }

    @Test
    fun verifiedPolicyUsesSignedTier() {
        val state = PolicyState.Verified("token", payload)
        assertEquals(PolicyTier.ACTIVE, state.effectiveTier)
    }

    @Test
    fun missingOrInvalidPolicyFailsSafeToSoftLock() {
        assertEquals(PolicyTier.SOFT_LOCK, PolicyState.Missing.effectiveTier)
        assertEquals(PolicyTier.SOFT_LOCK, PolicyState.Invalid("tampered").effectiveTier)
    }

    @Test
    fun unenrolledDeviceDoesNotEnterPolicyEnforcement() {
        assertNull(PolicyState.Unenrolled.effectiveTier)
    }
}
