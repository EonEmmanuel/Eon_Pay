package com.eonpay.deviceagent.data

import org.junit.Assert.assertThrows
import org.junit.Test

class PolicyReplayProtectorTest {
    @Test
    fun acceptsStrictlyNewerVersion() {
        PolicyReplayProtector.requireNewer(
            incoming = policy(version = 11, issuedAt = "2026-07-24T12:01:00Z"),
            current = policy(version = 10, issuedAt = "2026-07-24T12:00:00Z"),
        )
    }

    @Test
    fun rejectsLowerOrEqualVersion() {
        val current = policy(version = 10, issuedAt = "2026-07-24T12:00:00Z")

        assertThrows(IllegalArgumentException::class.java) {
            PolicyReplayProtector.requireNewer(
                incoming = policy(version = 9, issuedAt = "2026-07-24T12:01:00Z"),
                current = current,
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            PolicyReplayProtector.requireNewer(
                incoming = policy(version = 10, issuedAt = "2026-07-24T12:01:00Z"),
                current = current,
            )
        }
    }

    @Test
    fun rejectsUnversionedTokenAfterVersionedPolicy() {
        assertThrows(IllegalStateException::class.java) {
            PolicyReplayProtector.requireNewer(
                incoming = policy(version = null, issuedAt = "2026-07-24T12:01:00Z"),
                current = policy(version = 10, issuedAt = "2026-07-24T12:00:00Z"),
            )
        }
    }

    @Test
    fun legacyPoliciesFallBackToIssuedAt() {
        PolicyReplayProtector.requireNewer(
            incoming = policy(version = null, issuedAt = "2026-07-24T12:01:00Z"),
            current = policy(version = null, issuedAt = "2026-07-24T12:00:00Z"),
        )

        assertThrows(IllegalArgumentException::class.java) {
            PolicyReplayProtector.requireNewer(
                incoming = policy(version = null, issuedAt = "2026-07-24T11:59:00Z"),
                current = policy(version = null, issuedAt = "2026-07-24T12:00:00Z"),
            )
        }
    }

    private fun policy(version: Long?, issuedAt: String) = PolicyPayload(
        deviceId = "device-1",
        tenantId = "tenant-1",
        policyTier = PolicyTier.ACTIVE,
        issuedAt = issuedAt,
        expiresAt = "2026-07-25T12:00:00Z",
        policyVersion = version,
    )
}
