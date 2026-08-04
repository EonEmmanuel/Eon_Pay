package com.eonpay.deviceagent.sync

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.eonpay.deviceagent.data.PolicyRepository
import com.eonpay.deviceagent.security.SecureKeyStore
import com.eonpay.deviceagent.util.Telemetry

class FcmMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        SecureKeyStore.get(this).saveFcmToken(token)
        PolicySyncScheduler.enqueueImmediate(this, "fcm_token_refresh")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val signedToken = message.data["signedPolicyToken"]
            ?: message.data["signed_policy_token"]
        if (signedToken == null) {
            PolicySyncScheduler.enqueueImmediate(this, "fcm_policy_refresh")
            return
        }

        PolicyRepository.get(this).cacheVerified(signedToken)
            .onSuccess { payload ->
                val successfulCheckInAt = System.currentTimeMillis()
                SecureKeyStore.get(this).recordSuccessfulCheckIn(successfulCheckInAt)
                PolicySyncScheduler.scheduleExpiryGuard(this, payload.expiresAtInstant())
                PolicySyncScheduler.scheduleOfflineGuard(
                    context = this,
                    lastSuccessfulCheckInMillis = successfulCheckInAt,
                    enabled = payload.offlinePolicy.enabled,
                    gracePeriodSeconds = payload.offlinePolicy.gracePeriodSeconds,
                )
                PolicyApplicationCoordinator.enforceCurrent(this)
            }
            .onFailure { Telemetry.record(this, it, "fcm_policy_verification") }
    }

    override fun onDeletedMessages() {
        PolicySyncScheduler.enqueueImmediate(this, "fcm_messages_deleted")
    }
}
