package com.eonpay.deviceagent.data

import java.time.Instant

sealed interface PolicyState {
    data object Unenrolled : PolicyState

    data object Missing : PolicyState

    data class Verified(
        val signedToken: String,
        val payload: PolicyPayload,
    ) : PolicyState

    data class Expired(
        val payload: PolicyPayload,
        val expiredAt: Instant,
    ) : PolicyState

    data class Invalid(
        val reason: String,
    ) : PolicyState

    val payloadOrNull: PolicyPayload?
        get() = when (this) {
            is Verified -> payload
            is Expired -> payload
            is Invalid, Missing, Unenrolled -> null
        }

    val effectiveTier: PolicyTier?
        get() = when (this) {
            is Verified -> payload.policyTier
            is Expired -> PolicyTier.SOFT_LOCK
            is Invalid, Missing -> PolicyTier.SOFT_LOCK
            Unenrolled -> null
        }
}
