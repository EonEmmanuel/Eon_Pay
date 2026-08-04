package com.eonpay.deviceagent.admin

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import com.eonpay.deviceagent.BuildConfig
import com.eonpay.deviceagent.data.BrandingConfig
import com.eonpay.deviceagent.ui.LockScreenActivity
import com.eonpay.deviceagent.ui.MainStatusActivity
import java.lang.ref.WeakReference

class LockTaskManager private constructor(context: Context) {
    private val applicationContext = context.applicationContext
    private val policyManager = applicationContext.getSystemService(DevicePolicyManager::class.java)
    private val admin = FinanceDeviceAdminReceiver.componentName(applicationContext)

    fun enterHardLock(branding: BrandingConfig) {
        configureAllowlist(branding, includeConnectivitySettings = true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            policyManager.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
        }
        applicationContext.startActivity(
            Intent(applicationContext, LockScreenActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TASK or
                        Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS,
                )
            },
        )
    }

    fun enterSoftLock(branding: BrandingConfig) {
        configureAllowlist(branding, includeConnectivitySettings = true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            policyManager.setLockTaskFeatures(
                admin,
                DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO,
            )
        }
        val homeFilter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        policyManager.addPersistentPreferredActivity(
            admin,
            homeFilter,
            ComponentName(applicationContext, MainStatusActivity::class.java),
        )
        applicationContext.startActivity(
            Intent(applicationContext, MainStatusActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            },
        )
    }

    fun exitLockTask() {
        activityReference.get()?.get()?.let { activity ->
            runCatching { activity.stopLockTask() }
        }
        policyManager.clearPackagePersistentPreferredActivities(
            admin,
            applicationContext.packageName,
        )
        policyManager.setStatusBarDisabled(admin, false)
        policyManager.setLockTaskPackages(admin, emptyArray())
    }

    fun startFor(activity: Activity) {
        activityReference.set(WeakReference(activity))
        if (policyManager.isLockTaskPermitted(activity.packageName)) {
            runCatching { activity.startLockTask() }
        }
    }

    fun unregister(activity: Activity) {
        if (activityReference.get()?.get() === activity) {
            activityReference.set(null)
        }
    }

    fun allowedPackages(
        branding: BrandingConfig,
        includeConnectivitySettings: Boolean = false,
    ): Set<String> {
        val configured = BuildConfig.CONFIGURED_ALLOWED_PACKAGES
            .split(',')
            .map(String::trim)
            .filter(String::isNotBlank)
        return buildSet {
            add(applicationContext.packageName)
            addAll(configured)
            branding.paymentAppPackage?.takeIf(String::isNotBlank)?.let(::add)
            branding.smsPackage?.takeIf(String::isNotBlank)?.let(::add)
            Telephony.Sms.getDefaultSmsPackage(applicationContext)?.let(::add)
            applicationContext.getSystemService(TelecomManager::class.java)
                .defaultDialerPackage
                ?.let(::add)
            resolvePackage(Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")))?.let(::add)
            if (includeConnectivitySettings) {
                val settingsAction = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    Settings.Panel.ACTION_INTERNET_CONNECTIVITY
                } else {
                    Settings.ACTION_WIRELESS_SETTINGS
                }
                resolvePackage(Intent(settingsAction))?.let(::add)
            }
        }
    }

    private fun configureAllowlist(
        branding: BrandingConfig,
        includeConnectivitySettings: Boolean,
    ) {
        policyManager.setLockTaskPackages(
            admin,
            allowedPackages(branding, includeConnectivitySettings).toTypedArray(),
        )
    }

    private fun resolvePackage(intent: Intent): String? =
        applicationContext.packageManager.resolveActivity(intent, 0)?.activityInfo?.packageName

    companion object {
        private val activityReference = java.util.concurrent.atomic.AtomicReference<WeakReference<Activity>?>()

        @Volatile
        private var instance: LockTaskManager? = null

        fun get(context: Context): LockTaskManager =
            instance ?: synchronized(this) {
                instance ?: LockTaskManager(context).also { instance = it }
            }
    }
}
