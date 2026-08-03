package com.eonpay.deviceagent.provisioning

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.os.Bundle
import android.widget.Toast
import com.eonpay.deviceagent.R
import com.eonpay.deviceagent.admin.PolicyEnforcer
import com.eonpay.deviceagent.security.SecureKeyStore
import com.eonpay.deviceagent.sync.PolicyApplicationCoordinator
import com.eonpay.deviceagent.sync.PolicySyncScheduler

class ProvisioningActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val extras = intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
        val deviceId = extras?.getString(EXTRA_DEVICE_ID)?.trim().orEmpty()
        val enrollmentCredential = extras?.getString(EXTRA_ENROLLMENT_CREDENTIAL)
        val secureKeyStore = SecureKeyStore.get(this)
        secureKeyStore.markProvisioned()

        if (deviceId.isBlank()) {
            PolicyApplicationCoordinator.enforceCurrent(this)
            Toast.makeText(this, R.string.provisioning_error, Toast.LENGTH_LONG).show()
            setResult(RESULT_CANCELED)
            finish()
            return
        }

        secureKeyStore.saveProvisioning(deviceId, enrollmentCredential)
        PolicyEnforcer.get(this).applyBaselineRestrictions()
        PolicyApplicationCoordinator.enforceCurrent(this)
        PolicySyncScheduler.schedulePeriodic(this)
        PolicySyncScheduler.enqueueImmediate(this, "provisioning_activity")
        Toast.makeText(this, R.string.provisioning_complete, Toast.LENGTH_LONG).show()
        setResult(RESULT_OK)
        finish()
    }

    companion object {
        const val EXTRA_DEVICE_ID = "deviceId"
        const val EXTRA_ENROLLMENT_CREDENTIAL = "enrollmentCredential"
    }
}
