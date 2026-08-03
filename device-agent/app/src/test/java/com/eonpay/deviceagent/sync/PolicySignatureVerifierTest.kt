package com.eonpay.deviceagent.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

class PolicySignatureVerifierTest {
    @Test
    fun verifiesCompactEd25519TokenAndPreservesSignedValues() {
        val keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
        val rawPublicKey = keyPair.public.encoded.takeLast(32).toByteArray()
        val payload = """
            {
              "deviceId":"device-1",
              "tenantId":"tenant-1",
              "policyTier":"hard_lock",
              "amountDue":"12500",
              "daysOverdue":7,
              "brandingConfig":{"brandName":"Retailer","brandColor":"#123456","languageTag":"en"},
              "issuedAt":"2026-07-24T12:00:00Z",
              "expiresAt":"2026-07-25T12:00:00Z",
              "policyVersion":42
            }
        """.trimIndent().toByteArray()
        val signature = Signature.getInstance("Ed25519").run {
            initSign(keyPair.private)
            update(payload)
            sign()
        }
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val token = "${encoder.encodeToString(payload)}.${encoder.encodeToString(signature)}"
        val publicKey = Base64.getEncoder().encodeToString(rawPublicKey)

        val result = PolicySignatureVerifier(publicKey).verify(token)

        assertTrue(result.isSuccess)
        val verified = result.getOrThrow()
        assertEquals("12500", verified.amountDue)
        assertEquals(7, verified.daysOverdue)
        assertEquals("Retailer", verified.brandingConfig.brandName)
        assertEquals(42L, verified.policyVersion)
    }

    @Test
    fun rejectsModifiedPayload() {
        val keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair()
        val rawPublicKey = keyPair.public.encoded.takeLast(32).toByteArray()
        val originalPayload = validPayload("active").toByteArray()
        val signature = Signature.getInstance("Ed25519").run {
            initSign(keyPair.private)
            update(originalPayload)
            sign()
        }
        val encoder = Base64.getUrlEncoder().withoutPadding()
        val modifiedPayload = validPayload("hard_lock").toByteArray()
        val token = "${encoder.encodeToString(modifiedPayload)}.${encoder.encodeToString(signature)}"

        val result = PolicySignatureVerifier(
            Base64.getEncoder().encodeToString(rawPublicKey),
        ).verify(token)

        assertTrue(result.isFailure)
    }

    private fun validPayload(tier: String) =
        """{"deviceId":"device-1","tenantId":"tenant-1","policyTier":"$tier","amountDue":"0","daysOverdue":0,"brandingConfig":{},"issuedAt":"2026-07-24T12:00:00Z","expiresAt":"2026-07-25T12:00:00Z"}"""
}
