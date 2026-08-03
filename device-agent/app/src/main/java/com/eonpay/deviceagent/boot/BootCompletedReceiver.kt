package com.eonpay.deviceagent.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.UserManager
import com.eonpay.deviceagent.sync.PolicyApplicationCoordinator
import com.eonpay.deviceagent.sync.PolicySyncScheduler

class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_LOCKED_BOOT_COMPLETED -> {
                PolicyApplicationCoordinator.enforceCurrent(context)
            }
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            -> {
                PolicyApplicationCoordinator.enforceCurrent(context)
                if (context.getSystemService(UserManager::class.java).isUserUnlocked) {
                    PolicySyncScheduler.schedulePeriodic(context)
                    PolicySyncScheduler.enqueueImmediate(context, "boot")
                }
            }
        }
    }
}
