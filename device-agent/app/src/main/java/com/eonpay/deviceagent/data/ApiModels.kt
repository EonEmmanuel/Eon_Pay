package com.eonpay.deviceagent.data

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = false)
data class CheckInRequest(
    val iccid: String?,
    val imsi: String?,
    val connectivityState: String,
    val appVersion: String,
    val fcmToken: String?,
    val simChanged: Boolean,
    val integrityToken: String?,
)

@JsonClass(generateAdapter = false)
data class EnrollmentRequest(
    val deviceOwner: Boolean,
    val appVersion: String,
    val integrityToken: String?,
)

@JsonClass(generateAdapter = false)
data class DeviceCommand(
    val id: String,
    val kind: String,
    val reason: String,
)

@JsonClass(generateAdapter = false)
data class EnrollmentResponse(
    val deviceCredential: String,
    val signedPolicyToken: String,
    val commands: List<DeviceCommand> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class PolicyResponse(
    val signedPolicyToken: String,
    val commands: List<DeviceCommand> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class CommandAcknowledgementRequest(
    val success: Boolean,
    val failureReason: String? = null,
)

@JsonClass(generateAdapter = false)
data class SignedPolicyEnvelope(
    val payload: String,
    val signature: String,
)
