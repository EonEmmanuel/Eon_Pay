package com.eonpay.deviceagent.sync

import com.google.crypto.tink.subtle.Ed25519Verify
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.eonpay.deviceagent.BuildConfig
import com.eonpay.deviceagent.data.PolicyPayload
import com.eonpay.deviceagent.data.SignedPolicyEnvelope
import java.security.GeneralSecurityException
import java.util.Base64

class PolicySignatureVerifier(
    publicKeyConfiguration: String = BuildConfig.POLICY_PUBLIC_KEY,
) {
    private val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
    private val payloadAdapter = moshi.adapter(PolicyPayload::class.java)
    private val envelopeAdapter = moshi.adapter(SignedPolicyEnvelope::class.java)
    private val publicKey = decodePublicKey(publicKeyConfiguration)

    fun verify(signedToken: String): Result<PolicyPayload> = runCatching {
        val token = signedToken.trim()
        require(token.isNotEmpty()) { "The signed policy token is empty." }
        val verifier = Ed25519Verify(publicKey)

        val decoded = when {
            token.startsWith("{") -> decodeEnvelope(token)
            token.count { it == '.' } == 2 -> decodeJws(token)
            token.count { it == '.' } == 1 -> decodeCompact(token)
            else -> error("Unsupported signed policy token format.")
        }

        try {
            verifier.verify(decoded.signature, decoded.signedBytes)
        } catch (error: GeneralSecurityException) {
            throw SecurityException("The policy signature is invalid.", error)
        }

        payloadAdapter.fromJson(decoded.payloadJson)
            ?: error("The signed policy payload is empty.")
    }

    private fun decodeEnvelope(token: String): DecodedToken {
        val envelope = envelopeAdapter.fromJson(token) ?: error("Malformed policy envelope.")
        val payloadBytes = decodeBase64Url(envelope.payload)
        return DecodedToken(
            signedBytes = payloadBytes,
            signature = decodeBase64Url(envelope.signature),
            payloadJson = payloadBytes.toString(Charsets.UTF_8),
        )
    }

    private fun decodeCompact(token: String): DecodedToken {
        val (payload, signature) = token.split('.', limit = 2)
        val payloadBytes = decodeBase64Url(payload)
        return DecodedToken(
            signedBytes = payloadBytes,
            signature = decodeBase64Url(signature),
            payloadJson = payloadBytes.toString(Charsets.UTF_8),
        )
    }

    private fun decodeJws(token: String): DecodedToken {
        val segments = token.split('.')
        require(segments.size == 3) { "Malformed compact JWS." }
        val signedBytes = "${segments[0]}.${segments[1]}".toByteArray(Charsets.US_ASCII)
        val payloadBytes = decodeBase64Url(segments[1])
        return DecodedToken(
            signedBytes = signedBytes,
            signature = decodeBase64Url(segments[2]),
            payloadJson = payloadBytes.toString(Charsets.UTF_8),
        )
    }

    private fun decodePublicKey(configuration: String): ByteArray {
        require(configuration.isNotBlank()) {
            "DPC_POLICY_PUBLIC_KEY is not configured."
        }
        val normalized = configuration
            .replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", "")
            .replace("\\s".toRegex(), "")
        val decoded = runCatching { Base64.getDecoder().decode(normalized) }
            .getOrElse { throw IllegalArgumentException("The Ed25519 public key is not valid Base64.", it) }

        return when (decoded.size) {
            ED25519_PUBLIC_KEY_BYTES -> decoded
            X509_ED25519_PUBLIC_KEY_BYTES -> {
                require(decoded.copyOfRange(0, X509_PREFIX.size).contentEquals(X509_PREFIX)) {
                    "The public key is not an Ed25519 SubjectPublicKeyInfo value."
                }
                decoded.takeLast(ED25519_PUBLIC_KEY_BYTES).toByteArray()
            }
            else -> error("The Ed25519 public key must be a raw 32-byte or PEM/X.509 key.")
        }
    }

    private fun decodeBase64Url(value: String): ByteArray =
        runCatching {
            Base64.getUrlDecoder().decode(value)
        }.getOrElse { throw IllegalArgumentException("Invalid Base64URL token segment.", it) }

    private data class DecodedToken(
        val signedBytes: ByteArray,
        val signature: ByteArray,
        val payloadJson: String,
    )

    companion object {
        private const val ED25519_PUBLIC_KEY_BYTES = 32
        private const val X509_ED25519_PUBLIC_KEY_BYTES = 44
        private val X509_PREFIX = byteArrayOf(
            0x30, 0x2A, 0x30, 0x05, 0x06, 0x03, 0x2B, 0x65, 0x70, 0x03, 0x21, 0x00,
        )
    }
}
