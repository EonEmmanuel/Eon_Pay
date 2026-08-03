package com.eonpay.deviceagent.ui

import android.os.Bundle
import android.provider.Telephony
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.eonpay.deviceagent.R
import com.eonpay.deviceagent.admin.LockTaskManager
import com.eonpay.deviceagent.data.PolicyRepository
import com.eonpay.deviceagent.data.PolicyState
import com.eonpay.deviceagent.data.PolicyTier
import com.eonpay.deviceagent.databinding.ActivityMainStatusBinding
import com.eonpay.deviceagent.sync.PolicySyncScheduler
import kotlinx.coroutines.launch

class MainStatusActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainStatusBinding
    private val repository by lazy { PolicyRepository.get(this) }
    private val lockTaskManager by lazy { LockTaskManager.get(this) }
    private var currentState: PolicyState = PolicyState.Unenrolled

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        binding = ActivityMainStatusBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.syncButton.setOnClickListener {
            PolicySyncScheduler.enqueueImmediate(this, "manual_status_check")
        }
        binding.paymentButton.setOnClickListener {
            val branding = currentState.payloadOrNull?.brandingConfig ?: return@setOnClickListener
            if (!PolicyActions.openPayment(this, branding)) {
                Toast.makeText(this, R.string.payment_app_unavailable, Toast.LENGTH_LONG).show()
            }
        }
        binding.messagesButton.setOnClickListener {
            val branding = currentState.payloadOrNull?.brandingConfig ?: return@setOnClickListener
            if (!PolicyActions.openMessages(this, branding)) {
                Toast.makeText(this, R.string.action_unavailable, Toast.LENGTH_LONG).show()
            }
        }
        binding.emergencyButton.setOnClickListener {
            if (!PolicyActions.openEmergencyDialer(this)) {
                Toast.makeText(this, R.string.action_unavailable, Toast.LENGTH_LONG).show()
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                repository.policyState.collect(::render)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        when (repository.policyState.value.effectiveTier) {
            PolicyTier.HARD_LOCK -> showHardLock()
            PolicyTier.SOFT_LOCK -> lockTaskManager.startFor(this)
            else -> lockTaskManager.exitLockTask()
        }
    }

    override fun onDestroy() {
        lockTaskManager.unregister(this)
        super.onDestroy()
    }

    private fun render(state: PolicyState) {
        currentState = state
        if (state.effectiveTier == PolicyTier.HARD_LOCK) {
            showHardLock()
            return
        }

        binding.status.setText(
            when (state) {
                is PolicyState.Expired -> R.string.status_expired
                is PolicyState.Invalid, PolicyState.Missing -> R.string.status_unavailable
                PolicyState.Unenrolled -> R.string.status_unenrolled
                is PolicyState.Verified -> when (state.payload.policyTier) {
                    PolicyTier.ACTIVE -> R.string.status_active
                    PolicyTier.WARNING -> R.string.status_warning
                    PolicyTier.SOFT_LOCK -> R.string.status_soft_lock
                    PolicyTier.HARD_LOCK -> R.string.status_hard_lock
                }
            },
        )
        val isSoftLocked = state.effectiveTier == PolicyTier.SOFT_LOCK
        binding.paymentButton.visibility =
            if (isSoftLocked && state.payloadOrNull?.brandingConfig?.paymentDeepLink != null) {
                View.VISIBLE
            } else {
                View.GONE
            }
        binding.messagesButton.visibility =
            if (isSoftLocked && canOpenMessages()) View.VISIBLE else View.GONE
        binding.emergencyButton.visibility = if (isSoftLocked) View.VISIBLE else View.GONE
        if (isSoftLocked) lockTaskManager.startFor(this)
    }

    private fun canOpenMessages(): Boolean =
        currentState.payloadOrNull?.brandingConfig?.smsPackage != null ||
            Telephony.Sms.getDefaultSmsPackage(this) != null

    private fun showHardLock() {
        startActivity(android.content.Intent(this, LockScreenActivity::class.java))
        finish()
    }
}
