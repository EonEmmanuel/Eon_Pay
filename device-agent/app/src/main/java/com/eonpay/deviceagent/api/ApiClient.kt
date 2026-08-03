package com.eonpay.deviceagent.api

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.eonpay.deviceagent.BuildConfig
import com.eonpay.deviceagent.data.CheckInRequest
import com.eonpay.deviceagent.data.CommandAcknowledgementRequest
import com.eonpay.deviceagent.data.EnrollmentRequest
import com.eonpay.deviceagent.data.EnrollmentResponse
import com.eonpay.deviceagent.data.PolicyResponse
import okhttp3.CertificatePinner
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit

interface DeviceManagementApi {
    @POST("devices-mgmt/{deviceId}/enroll")
    suspend fun enroll(
        @Path("deviceId") deviceId: String,
        @Header("Authorization") authorization: String,
        @Body request: EnrollmentRequest,
    ): EnrollmentResponse

    @POST("devices-mgmt/{deviceId}/checkin")
    suspend fun checkIn(
        @Path("deviceId") deviceId: String,
        @Header("Authorization") authorization: String?,
        @Body request: CheckInRequest,
    ): PolicyResponse

    @POST("devices-mgmt/{deviceId}/commands/{commandId}/ack")
    suspend fun acknowledgeCommand(
        @Path("deviceId") deviceId: String,
        @Path("commandId") commandId: String,
        @Header("Authorization") authorization: String,
        @Body request: CommandAcknowledgementRequest,
    )
}

class ApiClient private constructor() {
    val service: DeviceManagementApi

    init {
        val baseUrl = BuildConfig.BACKEND_BASE_URL.trim()
        require(baseUrl.isNotEmpty()) { "DPC_BACKEND_BASE_URL is not configured." }
        require(baseUrl.startsWith("https://")) { "The backend base URL must use HTTPS." }
        val normalizedBaseUrl = if (baseUrl.endsWith('/')) baseUrl else "$baseUrl/"
        val parsedUrl = normalizedBaseUrl.toHttpUrlOrNull()
            ?: error("DPC_BACKEND_BASE_URL is not a valid URL.")

        val pins = BuildConfig.API_CERT_PINS.split(',')
            .map(String::trim)
            .filter(String::isNotEmpty)
        require(pins.size >= 2) {
            "DPC_API_CERT_PINS must contain a primary and backup sha256 pin."
        }

        val certificatePinner = CertificatePinner.Builder().apply {
            pins.forEach { pin ->
                require(pin.startsWith("sha256/")) { "Certificate pins must use sha256/." }
                add(parsedUrl.host, pin)
            }
        }.build()

        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
            redactHeader("Authorization")
        }

        val okHttp = OkHttpClient.Builder()
            .certificatePinner(certificatePinner)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .build()

        val moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
        service = Retrofit.Builder()
            .baseUrl(parsedUrl)
            .client(okHttp)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(DeviceManagementApi::class.java)
    }

    companion object {
        val instance: ApiClient by lazy { ApiClient() }
    }
}
