package com.eonpay.deviceagent.ui

import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.core.graphics.ColorUtils
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import coil.load
import com.eonpay.deviceagent.R
import com.eonpay.deviceagent.admin.LockTaskManager
import com.eonpay.deviceagent.data.BrandingConfig
import com.eonpay.deviceagent.data.PolicyPayload
import com.eonpay.deviceagent.data.PolicyTier
import com.eonpay.deviceagent.databinding.ActivityLockScreenBinding
import kotlinx.coroutines.launch
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class LockScreenActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLockScreenBinding
    private val viewModel: LockScreenViewModel by viewModels()
    private val lockTaskManager by lazy { LockTaskManager.get(this) }
    private var currentPayload: PolicyPayload? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SECURE,
        )
        WindowCompat.setDecorFitsSystemWindows(window, true)

        binding = ActivityLockScreenBinding.inflate(layoutInflater)
        setContentView(binding.root)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = Unit
            },
        )
        binding.payNowButton.setOnClickListener {
            val branding = currentPayload?.brandingConfig ?: return@setOnClickListener
            if (!PolicyActions.openPayment(this, branding)) {
                Toast.makeText(this, R.string.payment_app_unavailable, Toast.LENGTH_LONG).show()
            }
        }
        binding.emergencyButton.setOnClickListener {
            if (!PolicyActions.openEmergencyDialer(this)) {
                Toast.makeText(this, R.string.action_unavailable, Toast.LENGTH_LONG).show()
            }
        }
        binding.supportButton.setOnClickListener {
            val branding = currentPayload?.brandingConfig ?: return@setOnClickListener
            if (!PolicyActions.callSupport(this, branding)) {
                Toast.makeText(this, R.string.support_unavailable, Toast.LENGTH_LONG).show()
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect(::render)
            }
        }
        viewModel.startLiveCheckIns()
    }

    override fun onResume() {
        super.onResume()
        val tier = viewModel.uiState.value.policyState.effectiveTier
        if (tier == PolicyTier.HARD_LOCK) {
            lockTaskManager.startFor(this)
        } else if (tier != null) {
            unlockAndFinish()
        }
    }

    override fun onDestroy() {
        lockTaskManager.unregister(this)
        super.onDestroy()
    }

    private fun render(state: LockScreenUiState) {
        val payload = state.payload ?: return
        currentPayload = payload
        if (state.policyState.effectiveTier != PolicyTier.HARD_LOCK) {
            unlockAndFinish()
            return
        }
        lockTaskManager.startFor(this)

        applyTenantLocale(payload.brandingConfig.languageTag)
        applyBranding(payload.brandingConfig)
        binding.amountDue.text = getString(
            R.string.amount_due_value,
            payload.brandingConfig.currencyCode,
            payload.amountDue,
        ).trim()
        binding.daysOverdue.text = resources.getQuantityString(
            R.plurals.days_overdue,
            payload.daysOverdue,
            payload.daysOverdue,
        )
        binding.connectivityStatus.setText(
            if (state.isConnected) R.string.checking_status else R.string.offline_status,
        )
        val timestamp = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(ZoneId.systemDefault())
            .format(payload.issuedAtInstant())
        binding.lastUpdated.text = getString(R.string.last_updated, timestamp)
    }

    private fun applyBranding(branding: BrandingConfig) {
        binding.retailerName.text = branding.brandName
        val color = runCatching { Color.parseColor(branding.brandColor) }
            .getOrDefault(getColor(R.color.brand_default))
        val onBrandColor = if (ColorUtils.calculateLuminance(color) > 0.5) Color.BLACK else Color.WHITE
        binding.payNowButton.backgroundTintList = ColorStateList.valueOf(color)
        binding.payNowButton.setTextColor(onBrandColor)
        binding.title.setTextColor(color)
        binding.retailerName.setTextColor(color)
        binding.amountCard.strokeColor = color
        binding.emergencyButton.strokeColor = ColorStateList.valueOf(color)
        binding.emergencyButton.setTextColor(color)
        binding.supportButton.setTextColor(color)
        window.navigationBarColor = color
        branding.logoUrl
            ?.takeIf { it.startsWith("https://") }
            ?.let { url ->
                binding.retailerLogo.load(url) {
                    crossfade(true)
                    placeholder(R.drawable.ic_dpc)
                    error(R.drawable.ic_dpc)
                }
            } ?: binding.retailerLogo.setImageResource(R.drawable.ic_dpc)
    }

    private fun applyTenantLocale(languageTag: String) {
        val normalized = languageTag.takeIf(String::isNotBlank) ?: return
        val requested = LocaleListCompat.forLanguageTags(normalized)
        if (AppCompatDelegate.getApplicationLocales().toLanguageTags() != requested.toLanguageTags()) {
            AppCompatDelegate.setApplicationLocales(requested)
        }
    }

    private fun unlockAndFinish() {
        lockTaskManager.exitLockTask()
        finishAndRemoveTask()
    }
}
