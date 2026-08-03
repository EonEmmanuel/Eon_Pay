package com.eonpay.deviceagent

import android.app.Application
import android.os.UserManager
import com.eonpay.deviceagent.admin.PolicyEnforcer
import com.eonpay.deviceagent.data.PolicyRepository
import com.eonpay.deviceagent.data.PolicyState
import com.eonpay.deviceagent.sync.PolicySyncScheduler
import com.eonpay.deviceagent.util.Telemetry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class DpcApplication : Application() {
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        val repository = PolicyRepository.get(this)
        val policyEnforcer = PolicyEnforcer.get(this)

        applicationScope.launch {
            repository.policyState.collectLatest { state ->
                policyEnforcer.enforce(state)
                if (state is PolicyState.Verified) {
                    PolicySyncScheduler.scheduleExpiryGuard(this@DpcApplication, state.payload.expiresAtInstant())
                }
            }
        }

        if (getSystemService(UserManager::class.java).isUserUnlocked) {
            runCatching {
                PolicySyncScheduler.schedulePeriodic(this)
            }.onFailure { Telemetry.record(this, it, "schedule_periodic_sync") }
        }
    }
}
