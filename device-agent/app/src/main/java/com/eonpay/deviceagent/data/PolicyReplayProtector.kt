package com.eonpay.deviceagent.data

/**
 * Prevents a correctly signed but older policy from replacing a newer cached policy.
 *
 * A signed monotonic policyVersion is authoritative. issuedAt is retained as a migration
 * fallback for tokens issued before policyVersion was introduced.
 */
object PolicyReplayProtector {
    fun requireNewer(
        incoming: PolicyPayload,
        current: PolicyPayload,
    ) {
        val incomingVersion = incoming.policyVersion
        val currentVersion = current.policyVersion
        val incomingIssuedAt = incoming.issuedAtInstant()
        val currentIssuedAt = current.issuedAtInstant()

        when {
            currentVersion != null && incomingVersion == null -> {
                error("The policy omits policyVersion after versioned policies were activated.")
            }

            currentVersion != null && incomingVersion != null -> {
                require(incomingVersion > currentVersion) {
                    "The policyVersion is not newer than the cached policy."
                }
                require(!incomingIssuedAt.isBefore(currentIssuedAt)) {
                    "The policy issuedAt precedes the cached policy."
                }
            }

            currentVersion == null && incomingVersion != null -> {
                require(incomingIssuedAt.isAfter(currentIssuedAt)) {
                    "The first versioned policy must be newer than the cached legacy policy."
                }
            }

            else -> {
                require(incomingIssuedAt.isAfter(currentIssuedAt)) {
                    "The policy issuedAt is not newer than the cached policy."
                }
            }
        }
    }
}
