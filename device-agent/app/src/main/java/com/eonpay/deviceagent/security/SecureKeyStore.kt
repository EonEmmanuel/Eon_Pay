package com.eonpay.deviceagent.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureKeyStore private constructor(context: Context) {
    private val storageContext = context.applicationContext.createDeviceProtectedStorageContext()
    private val preferences = storageContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    val signedPolicyTokenFlow: Flow<String?> = callbackFlow {
        trySend(readEncrypted(KEY_SIGNED_POLICY))
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            if (key == KEY_SIGNED_POLICY) {
                trySend(readEncrypted(KEY_SIGNED_POLICY))
            }
        }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    fun saveSignedPolicyToken(token: String) = writeEncrypted(KEY_SIGNED_POLICY, token)

    fun signedPolicyToken(): String? = readEncrypted(KEY_SIGNED_POLICY)

    fun saveProvisioning(deviceId: String, enrollmentCredential: String?) {
        writeEncrypted(KEY_DEVICE_ID, deviceId)
        enrollmentCredential?.takeIf(String::isNotBlank)?.let {
            writeEncrypted(KEY_ENROLLMENT_CREDENTIAL, it)
        }
        markProvisioned()
    }

    fun deviceId(): String? = readEncrypted(KEY_DEVICE_ID)

    fun markProvisioned() {
        preferences.edit(commit = true) { putBoolean(KEY_PROVISIONED, true) }
    }

    fun isProvisioned(): Boolean =
        preferences.getBoolean(KEY_PROVISIONED, false) || !deviceId().isNullOrBlank()

    fun enrollmentCredential(): String? = readEncrypted(KEY_ENROLLMENT_CREDENTIAL)

    fun saveDeviceCredential(credential: String) {
        writeEncrypted(KEY_DEVICE_CREDENTIAL, credential)
        preferences.edit(commit = true) { remove(KEY_ENROLLMENT_CREDENTIAL) }
    }

    fun deviceCredential(): String? = readEncrypted(KEY_DEVICE_CREDENTIAL)

    fun saveFcmToken(token: String) = writeEncrypted(KEY_FCM_TOKEN, token)

    fun fcmToken(): String? = readEncrypted(KEY_FCM_TOKEN)

    fun recordSuccessfulCheckIn(epochMillis: Long) {
        preferences.edit(commit = true) { putLong(KEY_LAST_CHECK_IN, epochMillis) }
    }

    fun lastSuccessfulCheckIn(): Long = preferences.getLong(KEY_LAST_CHECK_IN, 0L)

    fun setSimIdentityHash(hash: String?) {
        preferences.edit(commit = true) {
            if (hash == null) remove(KEY_SIM_HASH) else putString(KEY_SIM_HASH, hash)
        }
    }

    fun simIdentityHash(): String? = preferences.getString(KEY_SIM_HASH, null)

    fun setSimChanged(changed: Boolean) {
        preferences.edit(commit = true) { putBoolean(KEY_SIM_CHANGED, changed) }
    }

    fun simChanged(): Boolean = preferences.getBoolean(KEY_SIM_CHANGED, false)

    private fun writeEncrypted(key: String, plaintext: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val combined = cipher.iv + cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        preferences.edit(commit = true) {
            putString(key, Base64.encodeToString(combined, Base64.NO_WRAP))
        }
    }

    private fun readEncrypted(key: String): String? {
        val encoded = preferences.getString(key, null) ?: return null
        return runCatching {
            val combined = Base64.decode(encoded, Base64.NO_WRAP)
            require(combined.size > IV_BYTES)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                GCMParameterSpec(GCM_TAG_BITS, combined.copyOfRange(0, IV_BYTES)),
            )
            cipher.doFinal(combined.copyOfRange(IV_BYTES, combined.size)).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFERENCES_NAME = "secure_device_state"
        private const val KEY_ALIAS = "finance_dpc_state_key_v1"
        private const val KEY_SIGNED_POLICY = "signed_policy"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_PROVISIONED = "provisioned"
        private const val KEY_ENROLLMENT_CREDENTIAL = "enrollment_credential"
        private const val KEY_DEVICE_CREDENTIAL = "device_credential"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_LAST_CHECK_IN = "last_check_in"
        private const val KEY_SIM_HASH = "sim_identity_hash"
        private const val KEY_SIM_CHANGED = "sim_changed"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_BYTES = 12
        private const val GCM_TAG_BITS = 128

        @Volatile
        private var instance: SecureKeyStore? = null

        fun get(context: Context): SecureKeyStore =
            instance ?: synchronized(this) {
                instance ?: SecureKeyStore(context).also { instance = it }
            }
    }
}
