package com.eonpay.deviceagent.ui

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.eonpay.deviceagent.R
import com.eonpay.deviceagent.data.PolicyPayload
import com.eonpay.deviceagent.data.PolicyRepository
import com.eonpay.deviceagent.data.PolicyTier

class WarningOverlayService : Service() {
    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val payload = PolicyRepository.get(this).policyState.value.payloadOrNull
        if (payload?.policyTier != PolicyTier.WARNING) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification(payload))
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(payload: PolicyPayload): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainStatusActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val color = runCatching { Color.parseColor(payload.brandingConfig.brandColor) }
            .getOrDefault(ContextCompat.getColor(this, R.color.warning_default))
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_dpc)
            .setColor(color)
            .setContentTitle(
                payload.brandingConfig.brandName.ifBlank {
                    getString(R.string.warning_notification_title)
                },
            )
            .setContentText(
                getString(
                    R.string.warning_notification_text,
                    payload.brandingConfig.currencyCode,
                    payload.amountDue,
                    payload.daysOverdue,
                ),
            )
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    private fun createChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.warning_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = getString(R.string.warning_channel_description)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableVibration(false)
                setSound(null, null)
            },
        )
    }

    companion object {
        private const val CHANNEL_ID = "payment_warning"
        private const val NOTIFICATION_ID = 4101

        fun start(context: Context, payload: PolicyPayload) {
            if (payload.policyTier != PolicyTier.WARNING) return
            ContextCompat.startForegroundService(
                context,
                Intent(context, WarningOverlayService::class.java),
            )
        }
    }
}
