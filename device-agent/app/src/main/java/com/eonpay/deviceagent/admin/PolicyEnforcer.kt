package com.eonpay.deviceagent.admin

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.UserManager
import com.eonpay.deviceagent.data.PolicyState
import com.eonpay.deviceagent.data.PolicyTier
import com.eonpay.deviceagent.data.BrandingConfig
import com.eonpay.deviceagent.ui.WarningOverlayService
import com.eonpay.deviceagent.util.Telemetry

class PolicyEnforcer private constructor(context: Context) {
    private val applicationContext = context.applicationContext
    private val policyManager = applicationContext.getSystemService(DevicePolicyManager::class.java)
    private val admin: ComponentName = FinanceDeviceAdminReceiver.componentName(applicationContext)
    private val lockTaskManager = LockTaskManager.get(applicationContext)

    @Synchronized
    fun enforce(state: PolicyState) {
        if (!policyManager.isDeviceOwnerApp(applicationContext.packageName)) return

        runCatching {
            applyBaselineRestrictions()
            when (state.effectiveTier) {
                PolicyTier.ACTIVE -> applyActive()
                PolicyTier.WARNING -> applyWarning(state)
                PolicyTier.SOFT_LOCK -> applySoftLock(state)
                PolicyTier.HARD_LOCK -> applyHardLock(state)
                null -> Unit
            }
        }.onFailure {
            Telemetry.record(applicationContext, it, "policy_enforcement")
        }
    }

    fun applyBaselineRestrictions() {
        if (!policyManager.isDeviceOwnerApp(applicationContext.packageName)) return
        safeBaselineCall("disallow_factory_reset") {
            policyManager.addUserRestriction(admin, UserManager.DISALLOW_FACTORY_RESET)
        }
        safeBaselineCall("disallow_safe_boot") {
            policyManager.addUserRestriction(admin, UserManager.DISALLOW_SAFE_BOOT)
        }
        safeBaselineCall("block_dpc_uninstall") {
            policyManager.setUninstallBlocked(admin, applicationContext.packageName, true)
        }
        safeBaselineCall("disallow_config_date_time") {
            policyManager.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME)
        }
        safeBaselineCall("disallow_usb_file_transfer") {
            policyManager.addUserRestriction(admin, UserManager.DISALLOW_USB_FILE_TRANSFER)
        }
        safeBaselineCall("disallow_physical_media") {
            policyManager.addUserRestriction(admin, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
        }
        safeBaselineCall("enable_frp") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // This ensures that even if wiped, the device remains locked to the management state.
                // In production, you would provide a specific authorized Google Account ID here.
                policyManager.setFactoryResetProtectionPolicy(
                    admin,
                    android.app.admin.FactoryResetProtectionPolicy.Builder()
                        .setFactoryResetProtectionEnabled(true)
                        .build(),
                )
            }
        }
        safeBaselineCall("grant_phone_state") {
            grantRuntimePermission(Manifest.permission.READ_PHONE_STATE)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            safeBaselineCall("grant_notifications") {
                grantRuntimePermission(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun applyActive() {
        applicationContext.stopService(Intent(applicationContext, WarningOverlayService::class.java))
        lockTaskManager.exitLockTask()
    }

    private fun applyWarning(state: PolicyState) {
        lockTaskManager.exitLockTask()
        val payload = state.payloadOrNull ?: return
        WarningOverlayService.start(applicationContext, payload)
    }

    private fun applySoftLock(state: PolicyState) {
        applicationContext.stopService(Intent(applicationContext, WarningOverlayService::class.java))
        policyManager.setStatusBarDisabled(admin, false)
        val branding = state.payloadOrNull?.brandingConfig ?: BrandingConfig()
        lockTaskManager.enterSoftLock(branding)
    }

    private fun applyHardLock(state: PolicyState) {
        applicationContext.stopService(Intent(applicationContext, WarningOverlayService::class.java))
        policyManager.setStatusBarDisabled(admin, true)
        val branding = state.payloadOrNull?.brandingConfig ?: return
        lockTaskManager.enterHardLock(branding)
    }

    private fun grantRuntimePermission(permission: String) {
        policyManager.setPermissionGrantState(
            admin,
            applicationContext.packageName,
            permission,
            DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
        )
    }

    private inline fun safeBaselineCall(operation: String, block: () -> Unit) {
        runCatching(block).onFailure {
            Telemetry.record(applicationContext, it, "baseline_$operation")
        }
    }

    companion object {
        @Volatile
        private var instance: PolicyEnforcer? = null

        fun get(context: Context): PolicyEnforcer =
            instance ?: synchronized(this) {
                instance ?: PolicyEnforcer(context).also { instance = it }
            }
    }
}
