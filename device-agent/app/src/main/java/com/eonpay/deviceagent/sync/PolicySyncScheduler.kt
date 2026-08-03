package com.eonpay.deviceagent.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

object PolicySyncScheduler {
    private const val PERIODIC_WORK_NAME = "finance_dpc_periodic_check_in"
    private const val IMMEDIATE_WORK_NAME = "finance_dpc_immediate_check_in"
    private const val EXPIRY_WORK_NAME = "finance_dpc_policy_expiry_guard"

    fun schedulePeriodic(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = PeriodicWorkRequestBuilder<PolicyCheckInWorker>(
            15,
            TimeUnit.MINUTES,
            5,
            TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun enqueueImmediate(context: Context, reason: String) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val request = OneTimeWorkRequestBuilder<PolicyCheckInWorker>()
            .setConstraints(constraints)
            .setInputData(androidx.work.workDataOf("reason" to reason))
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun scheduleExpiryGuard(context: Context, expiresAt: Instant) {
        val delay = Duration.between(Instant.now(), expiresAt).coerceAtLeast(Duration.ZERO)
        val request = OneTimeWorkRequestBuilder<PolicyExpiryWorker>()
            .setInitialDelay(delay.toMillis(), TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            EXPIRY_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }
}
