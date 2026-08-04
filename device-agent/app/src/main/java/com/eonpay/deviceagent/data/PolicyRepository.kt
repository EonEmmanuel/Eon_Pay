package com.eonpay.deviceagent.data

import android.content.Context
import com.eonpay.deviceagent.security.SecureKeyStore
import com.eonpay.deviceagent.sync.PolicySignatureVerifier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Duration
import java.time.Instant

class PolicyRepository private constructor(
    context: Context,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val secureKeyStore = SecureKeyStore.get(context)
    private val verifier by lazy { PolicySignatureVerifier() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val mutablePolicyState = MutableStateFlow<PolicyState>(
        if (secureKeyStore.isProvisioned()) PolicyState.Missing else PolicyState.Unenrolled,
    )

    val policyState: StateFlow<PolicyState> = mutablePolicyState.asStateFlow()

    init {
        evaluate(secureKeyStore.signedPolicyToken())
        scope.launch {
            secureKeyStore.signedPolicyTokenFlow.collectLatest(::evaluate)
        }
        scope.launch {
            while (true) {
                delay(EXPIRY_RECHECK_MILLIS)
                val currentToken = (mutablePolicyState.value as? PolicyState.Verified)?.signedToken
                    ?: secureKeyStore.signedPolicyToken()
                evaluate(currentToken)
            }
        }
    }

    fun verifyForCaching(signedToken: String): Result<PolicyPayload> =
        runCatching {
            val payload = verifier.verify(signedToken).getOrThrow()
            require(secureKeyStore.isProvisioned()) {
                "The device has not completed Device Owner provisioning."
            }
            val provisionedDeviceId = secureKeyStore.deviceId()
            require(!provisionedDeviceId.isNullOrBlank()) {
                "The provisioned device identity is unavailable."
            }
            require(payload.deviceId == provisionedDeviceId) {
                "The policy was issued for a different device."
            }
            val now = Instant.now(clock)
            val issuedAt = payload.issuedAtInstant()
            val expiresAt = payload.expiresAtInstant()
            require(!issuedAt.isAfter(now.plus(MAX_ISSUED_AT_CLOCK_SKEW))) {
                "The policy issuedAt is too far in the future."
            }
            require(expiresAt.isAfter(issuedAt)) {
                "The policy expiresAt must be after issuedAt."
            }
            require(expiresAt.isAfter(now)) {
                "The received policy has already expired."
            }
            validateOfflinePolicy(payload.offlinePolicy)
            payload.policyVersion?.let { version ->
                require(version >= 0) { "The policyVersion cannot be negative." }
            }

            val cachedToken = secureKeyStore.signedPolicyToken()
            if (!cachedToken.isNullOrBlank() && cachedToken != signedToken) {
                verifier.verify(cachedToken).getOrNull()?.let { cachedPayload ->
                    PolicyReplayProtector.requireNewer(payload, cachedPayload)
                }
            }
            payload
        }

    @Synchronized
    fun cacheVerified(signedToken: String): Result<PolicyPayload> =
        verifyForCaching(signedToken).onSuccess {
            secureKeyStore.saveSignedPolicyToken(signedToken)
            evaluate(signedToken)
        }

    fun refreshFromCache() = evaluate(secureKeyStore.signedPolicyToken())

    private fun evaluate(signedToken: String?) {
        if (!secureKeyStore.isProvisioned()) {
            mutablePolicyState.value = PolicyState.Unenrolled
            return
        }

        if (signedToken.isNullOrBlank()) {
            mutablePolicyState.value = PolicyState.Missing
            return
        }
        val result = runCatching {
            val payload = verifier.verify(signedToken).getOrThrow()
            val provisionedDeviceId = secureKeyStore.deviceId()
            require(!provisionedDeviceId.isNullOrBlank()) {
                "The provisioned device identity is unavailable."
            }
            require(payload.deviceId == provisionedDeviceId) {
                "The cached policy was issued for a different device."
            }
            validateOfflinePolicy(payload.offlinePolicy)
            val now = Instant.now(clock)
            val expiresAt = payload.expiresAtInstant()
            val lastCheckInMillis = secureKeyStore.lastSuccessfulCheckIn()
            if (payload.offlinePolicy.enabled && lastCheckInMillis > 0) {
                val lastCheckIn = Instant.ofEpochMilli(lastCheckInMillis)
                val deadline = lastCheckIn.plusSeconds(payload.offlinePolicy.gracePeriodSeconds)
                if (!now.isBefore(deadline)) {
                    return@runCatching PolicyState.Offline(
                        signedToken = signedToken,
                        payload = payload,
                        lastSuccessfulCheckIn = lastCheckIn,
                        enforcementDeadline = deadline,
                    )
                }
                if (!expiresAt.isAfter(now)) {
                    return@runCatching PolicyState.OfflineGrace(
                        signedToken = signedToken,
                        payload = payload,
                        lastSuccessfulCheckIn = lastCheckIn,
                        enforcementDeadline = deadline,
                    )
                }
            }
            if (!expiresAt.isAfter(now)) {
                PolicyState.Expired(payload, expiresAt)
            } else {
                PolicyState.Verified(signedToken, payload)
            }
        }
        mutablePolicyState.value = result.getOrElse {
            PolicyState.Invalid(it.message ?: "The cached policy is invalid.")
        }
    }

    companion object {
        private const val EXPIRY_RECHECK_MILLIS = 30_000L
        private val MAX_ISSUED_AT_CLOCK_SKEW: Duration = Duration.ofMinutes(5)
        private val MIN_OFFLINE_GRACE: Duration = Duration.ofHours(1)
        private val MAX_OFFLINE_GRACE: Duration = Duration.ofDays(30)

        private fun validateOfflinePolicy(policy: OfflinePolicyConfig) {
            if (!policy.enabled) return
            require(policy.enforcementTier == PolicyTier.SOFT_LOCK) {
                "Offline enforcement is limited to a recoverable soft lock."
            }
            require(
                policy.gracePeriodSeconds in MIN_OFFLINE_GRACE.seconds..MAX_OFFLINE_GRACE.seconds,
            ) {
                "The offline grace period must be between 1 hour and 30 days."
            }
        }

        @Volatile
        private var instance: PolicyRepository? = null

        fun get(context: Context): PolicyRepository =
            instance ?: synchronized(this) {
                instance ?: PolicyRepository(context.applicationContext).also { instance = it }
            }
    }
}
