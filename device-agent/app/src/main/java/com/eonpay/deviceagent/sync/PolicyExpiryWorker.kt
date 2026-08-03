package com.eonpay.deviceagent.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.eonpay.deviceagent.data.PolicyRepository

class PolicyExpiryWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        PolicyRepository.get(applicationContext).refreshFromCache()
        PolicyApplicationCoordinator.enforceCurrent(applicationContext)
        PolicySyncScheduler.enqueueImmediate(applicationContext, "policy_expired")
        return Result.success()
    }
}
