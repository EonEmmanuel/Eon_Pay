package com.eonpay.deviceagent.sync

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.installations.FirebaseInstallations
import com.eonpay.deviceagent.BuildConfig
import com.eonpay.deviceagent.api.ApiClient
import com.eonpay.deviceagent.data.CheckInRequest
import com.eonpay.deviceagent.data.CommandAcknowledgementRequest
import com.eonpay.deviceagent.data.DeviceCommand
import com.eonpay.deviceagent.data.EnrollmentRequest
import com.eonpay.deviceagent.data.PolicyRepository
import com.eonpay.deviceagent.security.DeviceIntegrityChecker
import com.eonpay.deviceagent.security.SecureKeyStore
import com.eonpay.deviceagent.telephony.SimStateMonitor
import com.eonpay.deviceagent.util.Telemetry
import kotlinx.coroutines.tasks.await
import retrofit2.HttpException
import java.io.IOException

class PolicyCheckInWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {

    override suspend fun doWork(): Result {
        val secureStore = SecureKeyStore.get(applicationContext)
        val deviceId = secureStore.deviceId()
            ?: return Result.failure(failureData("The device has not been provisioned."))

        return runCatching {
            val simIdentity = SimStateMonitor.readIdentity(applicationContext)
            val appVersion = applicationContext.packageManager
                .getPackageInfo(applicationContext.packageName, 0)
                .versionName
                .orEmpty()
            val deviceCredential = secureStore.deviceCredential()
            val authenticationCredential = deviceCredential
                ?: secureStore.enrollmentCredential()
                ?: error("The device authentication credential is unavailable.")
            val integrityMaterial = "$deviceId|$authenticationCredential"
            val integrityToken = DeviceIntegrityChecker(applicationContext)
                .requestToken(integrityMaterial)
                .getOrNull()

            val request = CheckInRequest(
                iccid = simIdentity.iccid,
                imsi = simIdentity.imsi,
                connectivityState = connectivityState(applicationContext),
                appVersion = appVersion,
                fcmToken = secureStore.fcmToken(),
                firebaseInstallationId = firebaseInstallationId(),
                simChanged = secureStore.simChanged(),
                integrityToken = integrityToken,
            )
            val api = ApiClient.instance.service
            val response = if (deviceCredential == null) {
                val enrollmentCredential = secureStore.enrollmentCredential()
                    ?: error("The one-time enrollment credential is unavailable.")
                val policyManager = applicationContext
                    .getSystemService(DevicePolicyManager::class.java)
                val enrollment = api.enroll(
                    deviceId = deviceId,
                    authorization = "Bearer $enrollmentCredential",
                    request = EnrollmentRequest(
                        deviceOwner = policyManager.isDeviceOwnerApp(applicationContext.packageName),
                        appVersion = appVersion,
                        integrityToken = integrityToken,
                    ),
                )
                secureStore.saveDeviceCredential(enrollment.deviceCredential)
                CheckInResult(enrollment.signedPolicyToken, enrollment.commands)
            } else {
                val checkIn = api.checkIn(
                    deviceId = deviceId,
                    authorization = "Bearer $deviceCredential",
                    request = request,
                )
                CheckInResult(checkIn.signedPolicyToken, checkIn.commands)
            }
            val repository = PolicyRepository.get(applicationContext)
            val payload = repository.cacheVerified(response.signedPolicyToken).getOrThrow()

            val successfulCheckInAt = System.currentTimeMillis()
            secureStore.recordSuccessfulCheckIn(successfulCheckInAt)
            secureStore.setSimChanged(false)
            simIdentity.stableHash()?.let(secureStore::setSimIdentityHash)
            PolicySyncScheduler.scheduleExpiryGuard(applicationContext, payload.expiresAtInstant())
            PolicySyncScheduler.scheduleOfflineGuard(
                context = applicationContext,
                lastSuccessfulCheckInMillis = successfulCheckInAt,
                enabled = payload.offlinePolicy.enabled,
                gracePeriodSeconds = payload.offlinePolicy.gracePeriodSeconds,
            )
            PolicyApplicationCoordinator.enforceCurrent(applicationContext)
            acknowledgeCommands(deviceId, secureStore, response.commands)
            Result.success()
        }.getOrElse { error ->
            Telemetry.record(applicationContext, error, "policy_check_in")
            when (error) {
                is IOException -> Result.retry()
                is HttpException -> {
                    if (error.code() >= 500 || error.code() == 408 || error.code() == 429) {
                        Result.retry()
                    } else {
                        Result.failure(failureData("Check-in rejected with HTTP ${error.code()}."))
                    }
                }
                else -> Result.failure(failureData(error.message ?: "Policy check-in failed."))
            }
        }
    }

    private suspend fun acknowledgeCommands(
        deviceId: String,
        secureStore: SecureKeyStore,
        commands: List<DeviceCommand>,
    ) {
        val credential = secureStore.deviceCredential() ?: return
        commands.forEach { command ->
            val supported = command.kind != "wipe"
            ApiClient.instance.service.acknowledgeCommand(
                deviceId = deviceId,
                commandId = command.id,
                authorization = "Bearer $credential",
                request = CommandAcknowledgementRequest(
                    success = supported,
                    failureReason = if (supported) null else "Remote wipe requires a dedicated approved flow.",
                ),
            )
        }
    }

    private suspend fun firebaseInstallationId(): String? {
        if (!BuildConfig.FIREBASE_CONFIGURED) return null
        return runCatching { FirebaseInstallations.getInstance().id.await() }.getOrNull()
    }

    private fun connectivityState(context: Context): String {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return "offline"
        val capabilities = manager.getNetworkCapabilities(network) ?: return "offline"
        if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return "offline"
        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
    }

    private data class CheckInResult(
        val signedPolicyToken: String,
        val commands: List<DeviceCommand>,
    )

    private fun failureData(message: String) =
        androidx.work.workDataOf("error" to message.take(500))
}
