package com.eonpay.deviceagent.admin

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.eonpay.deviceagent.data.PolicyRepository
import com.eonpay.deviceagent.data.PolicyTier
import com.eonpay.deviceagent.provisioning.ProvisioningActivity
import com.eonpay.deviceagent.security.SecureKeyStore
import com.eonpay.deviceagent.sync.PolicyApplicationCoordinator
import com.eonpay.deviceagent.sync.PolicySyncScheduler

class FinanceDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        PolicyEnforcer.get(context).applyBaselineRestrictions()
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        val manager = context.getSystemService(DevicePolicyManager::class.java)
        val extras = intent.getBundleExtra(
            DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
        )
        val secureKeyStore = SecureKeyStore.get(context)
        secureKeyStore.markProvisioned()
        extras?.getString(ProvisioningActivity.EXTRA_DEVICE_ID)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.let { deviceId ->
                secureKeyStore.saveProvisioning(
                    deviceId,
                    extras.getString(ProvisioningActivity.EXTRA_ENROLLMENT_CREDENTIAL),
                )
            }
        runCatching {
            manager.setProfileName(componentName(context), "Finance device policy")
        }
        PolicyEnforcer.get(context).applyBaselineRestrictions()
        PolicyApplicationCoordinator.enforceCurrent(context)
        PolicySyncScheduler.schedulePeriodic(context)
        PolicySyncScheduler.enqueueImmediate(context, "provisioning_complete")
    }

    override fun onLockTaskModeExiting(context: Context, intent: Intent) {
        val tier = PolicyRepository.get(context).policyState.value.effectiveTier
        if (tier == PolicyTier.HARD_LOCK || tier == PolicyTier.SOFT_LOCK) {
            Handler(Looper.getMainLooper()).postDelayed(
                { PolicyApplicationCoordinator.enforceCurrent(context) },
                250,
            )
        }
    }

    companion object {
        fun componentName(context: Context) =
            ComponentName(context, FinanceDeviceAdminReceiver::class.java)
    }
}
