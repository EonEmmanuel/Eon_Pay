package com.eonpay.deviceagent.data

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import java.time.Instant

enum class PolicyTier {
    @Json(name = "active")
    ACTIVE,

    @Json(name = "warning")
    WARNING,

    @Json(name = "soft_lock")
    SOFT_LOCK,

    @Json(name = "hard_lock")
    HARD_LOCK,
}

@JsonClass(generateAdapter = false)
data class BrandingConfig(
    val brandName: String = "",
    val brandColor: String = "#2457C5",
    val logoUrl: String? = null,
    val languageTag: String = "en",
    val currencyCode: String = "",
    val paymentAppPackage: String? = null,
    val paymentDeepLink: String? = null,
    val supportPhone: String? = null,
    val smsPackage: String? = null,
)

@JsonClass(generateAdapter = false)
data class OfflinePolicyConfig(
    val enabled: Boolean = false,
    val gracePeriodSeconds: Long = 0,
    val enforcementTier: PolicyTier = PolicyTier.SOFT_LOCK,
)

@JsonClass(generateAdapter = false)
data class PolicyPayload(
    val deviceId: String,
    val tenantId: String,
    val policyTier: PolicyTier,
    val amountDue: String = "0",
    val daysOverdue: Int = 0,
    val brandingConfig: BrandingConfig = BrandingConfig(),
    val issuedAt: String,
    val expiresAt: String,
    val policyVersion: Long? = null,
    val offlinePolicy: OfflinePolicyConfig = OfflinePolicyConfig(),
) {
    fun issuedAtInstant(): Instant = PolicyTime.parse(issuedAt)

    fun expiresAtInstant(): Instant = PolicyTime.parse(expiresAt)
}

object PolicyTime {
    fun parse(value: String): Instant {
        val trimmed = value.trim()
        return trimmed.toLongOrNull()?.let { epoch ->
            if (trimmed.length >= 13) Instant.ofEpochMilli(epoch) else Instant.ofEpochSecond(epoch)
        } ?: Instant.parse(trimmed)
    }
}
