package com.eonpay.deviceagent.sync

import android.content.Context
import com.eonpay.deviceagent.admin.PolicyEnforcer
import com.eonpay.deviceagent.data.PolicyRepository

object PolicyApplicationCoordinator {
    fun enforceCurrent(context: Context) {
        val repository = PolicyRepository.get(context)
        repository.refreshFromCache()
        PolicyEnforcer.get(context).enforce(repository.policyState.value)
    }
}
