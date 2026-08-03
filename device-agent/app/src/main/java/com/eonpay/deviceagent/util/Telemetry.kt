package com.eonpay.deviceagent.util

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.eonpay.deviceagent.BuildConfig

object Telemetry {
    fun record(context: Context, throwable: Throwable, operation: String) {
        Log.e("EonPayDeviceAgent", operation, throwable)
        if (!BuildConfig.FIREBASE_CONFIGURED) return
        runCatching {
            if (FirebaseApp.getApps(context).isNotEmpty()) {
                FirebaseCrashlytics.getInstance().apply {
                    setCustomKey("operation", operation)
                    recordException(throwable)
                }
            }
        }
    }
}
