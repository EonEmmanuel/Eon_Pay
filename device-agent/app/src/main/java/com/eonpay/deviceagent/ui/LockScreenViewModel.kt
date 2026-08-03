package com.eonpay.deviceagent.ui

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.eonpay.deviceagent.data.PolicyPayload
import com.eonpay.deviceagent.data.PolicyRepository
import com.eonpay.deviceagent.data.PolicyState
import com.eonpay.deviceagent.sync.PolicySyncScheduler
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class LockScreenUiState(
    val policyState: PolicyState,
    val payload: PolicyPayload?,
    val isConnected: Boolean,
)

class LockScreenViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = PolicyRepository.get(application)
    private val connectivity = connectivityFlow(application)

    val uiState = combine(repository.policyState, connectivity) { policy, connected ->
        LockScreenUiState(
            policyState = policy,
            payload = policy.payloadOrNull,
            isConnected = connected,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.Eagerly,
        initialValue = LockScreenUiState(
            policyState = repository.policyState.value,
            payload = repository.policyState.value.payloadOrNull,
            isConnected = isConnected(application),
        ),
    )

    fun startLiveCheckIns() {
        viewModelScope.launch {
            while (true) {
                PolicySyncScheduler.enqueueImmediate(getApplication(), "hard_lock_visible")
                delay(LIVE_CHECK_INTERVAL_MILLIS)
            }
        }
    }

    private fun connectivityFlow(application: Application): Flow<Boolean> = callbackFlow {
        val manager = application.getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(isConnected(application))
            }

            override fun onLost(network: Network) {
                trySend(isConnected(application))
            }

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities,
            ) {
                trySend(
                    networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
                )
            }
        }
        trySend(isConnected(application))
        manager.registerDefaultNetworkCallback(callback)
        awaitClose { manager.unregisterNetworkCallback(callback) }
    }

    private fun isConnected(context: Application): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    companion object {
        private const val LIVE_CHECK_INTERVAL_MILLIS = 5_000L
    }
}
