package com.eonpay.deviceagent.security

import android.content.Context
import android.util.Base64
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import com.eonpay.deviceagent.BuildConfig
import kotlinx.coroutines.tasks.await
import java.security.MessageDigest

class DeviceIntegrityChecker(context: Context) {
    private val applicationContext = context.applicationContext

    suspend fun requestToken(requestMaterial: String): Result<String?> = runCatching {
        val projectNumber = BuildConfig.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER
            .trim()
            .takeIf(String::isNotEmpty)
            ?.toLongOrNull()
            ?: return@runCatching null

        val manager = IntegrityManagerFactory.createStandard(applicationContext)
        val provider = manager.prepareIntegrityToken(
            StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                .setCloudProjectNumber(projectNumber)
                .build(),
        ).await()

        val requestHash = Base64.encodeToString(
            MessageDigest.getInstance("SHA-256")
                .digest(requestMaterial.toByteArray(Charsets.UTF_8)),
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
        provider.request(
            StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
                .setRequestHash(requestHash)
                .build(),
        ).await().token()
    }
}
