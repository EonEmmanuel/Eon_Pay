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
            ?: return

        PolicyRepository.get(this).cacheVerified(signedToken)
            .onSuccess { payload ->
                SecureKeyStore.get(this).recordSuccessfulCheckIn(System.currentTimeMillis())
                PolicySyncScheduler.scheduleExpiryGuard(this, payload.expiresAtInstant())
                PolicyApplicationCoordinator.enforceCurrent(this)
            }
            .onFailure { Telemetry.record(this, it, "fcm_policy_verification") }
    }

    override fun onDeletedMessages() {
        PolicySyncScheduler.enqueueImmediate(this, "fcm_messages_deleted")
    }
}
