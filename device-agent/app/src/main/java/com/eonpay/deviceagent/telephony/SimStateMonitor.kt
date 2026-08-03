package com.eonpay.deviceagent.telephony

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.eonpay.deviceagent.security.SecureKeyStore
import com.eonpay.deviceagent.sync.PolicySyncScheduler
import java.security.MessageDigest

class SimStateMonitor : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SIM_STATE_CHANGED) return

        val secureStore = SecureKeyStore.get(context)
        val identity = readIdentity(context)
        val currentHash = identity.stableHash() ?: return
        val previousHash = secureStore.simIdentityHash()

        if (previousHash == null) {
            secureStore.setSimIdentityHash(currentHash)
        } else if (previousHash != currentHash) {
            secureStore.setSimIdentityHash(currentHash)
            secureStore.setSimChanged(true)
            PolicySyncScheduler.enqueueImmediate(context, "sim_changed")
        }
    }

    data class SimIdentity(
        val iccid: String?,
        val imsi: String?,
    ) {
        fun stableHash(): String? {
            if (iccid.isNullOrBlank() && imsi.isNullOrBlank()) return null
            val source = "${iccid.orEmpty()}\u0000${imsi.orEmpty()}"
            return MessageDigest.getInstance("SHA-256")
                .digest(source.toByteArray())
                .joinToString("") { "%02x".format(it) }
        }
    }

    companion object {
        private const val ACTION_SIM_STATE_CHANGED = "android.intent.action.SIM_STATE_CHANGED"

        fun readIdentity(context: Context): SimIdentity {
            if (
                ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return SimIdentity(null, null)
            }

            return runCatching {
                val subscriptionManager = context.getSystemService(SubscriptionManager::class.java)
                val telephonyManager = context.getSystemService(TelephonyManager::class.java)
                val subscription = subscriptionManager.activeSubscriptionInfoList
                    ?.firstOrNull()
                    ?: return@runCatching SimIdentity(null, null)
                val perSubscription = telephonyManager.createForSubscriptionId(subscription.subscriptionId)
                @Suppress("DEPRECATION")
                SimIdentity(
                    iccid = subscription.iccId?.takeIf(String::isNotBlank),
                    imsi = perSubscription.subscriberId?.takeIf(String::isNotBlank),
                )
            }.getOrDefault(SimIdentity(null, null))
        }
    }
}
