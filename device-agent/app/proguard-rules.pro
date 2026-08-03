-keep class com.eonpay.deviceagent.admin.FinanceDeviceAdminReceiver { *; }
-keep class com.eonpay.deviceagent.boot.BootCompletedReceiver { *; }
-keep class com.eonpay.deviceagent.telephony.SimStateMonitor { *; }
-keep class com.eonpay.deviceagent.sync.FcmMessagingService { *; }

-keepclasseswithmembers,allowobfuscation,includedescriptorclasses class * {
    @com.squareup.moshi.FromJson <methods>;
    @com.squareup.moshi.ToJson <methods>;
}
-keep @com.squareup.moshi.JsonClass class * extends java.lang.Object { *; }
-keepclassmembers class com.eonpay.deviceagent.data.** { <fields>; <methods>; }

-keepattributes Signature
-keepattributes *Annotation*
-dontwarn org.conscrypt.**
