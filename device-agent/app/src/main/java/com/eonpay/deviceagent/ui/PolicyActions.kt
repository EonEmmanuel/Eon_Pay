package com.eonpay.deviceagent.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Telephony
import com.eonpay.deviceagent.data.BrandingConfig

object PolicyActions {
    fun openPayment(context: Context, branding: BrandingConfig): Boolean {
        val deepLink = branding.paymentDeepLink?.takeIf(String::isNotBlank) ?: return false
        val uri = runCatching { Uri.parse(deepLink) }.getOrNull() ?: return false
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            branding.paymentAppPackage?.takeIf(String::isNotBlank)?.let(::setPackage)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafely(context, intent)
    }

    fun openMessages(context: Context, branding: BrandingConfig): Boolean {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")).apply {
            (
                branding.smsPackage?.takeIf(String::isNotBlank)
                    ?: Telephony.Sms.getDefaultSmsPackage(context)
                )?.let(::setPackage)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafely(context, intent)
    }

    fun openEmergencyDialer(context: Context): Boolean {
        val emergencyIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return startSafely(context, emergencyIntent)
    }

    fun callSupport(context: Context, branding: BrandingConfig): Boolean {
        val phone = branding.supportPhone?.takeIf(String::isNotBlank) ?: return false
        return startSafely(
            context,
            Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", phone, null)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
    }

    private fun startSafely(context: Context, intent: Intent): Boolean =
        runCatching {
            context.startActivity(intent)
            true
        }.getOrDefault(false)
}
