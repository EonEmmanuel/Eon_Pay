package com.eonpay.deviceagent.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class OfflinePolicyWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        PolicyApplicationCoordinator.enforceCurrent(applicationContext)
        return Result.success()
    }
}