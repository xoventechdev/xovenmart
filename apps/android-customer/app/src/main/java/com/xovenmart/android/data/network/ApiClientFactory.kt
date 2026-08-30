package com.xovenmart.android.data.network

import com.xovenmart.android.core.BuildConfigBridge
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Builds the shared [OkHttpClient] + [Retrofit]. Bound in `NetworkModule`.
 *
 * Wire format note: the NestJS API returns camelCase JSON, so we keep
 * `Json` defaults (no naming strategy). DTOs match the wire exactly.
 */
@Singleton
class ApiClientFactory @Inject constructor(
    private val tokens: SecureTokenStore,
    private val refreshAuthenticator: RefreshAuthenticator,
) {
    val baseUrl: String = BuildConfigBridge.apiBaseUrl

    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
        coerceInputValues = true
    }

    fun okHttp(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfigBridge.isDebug) HttpLoggingInterceptor.Level.BODY
                    else HttpLoggingInterceptor.Level.NONE
            // Strip Authorization + refresh token from logs (defense in depth
            // — logcat is process-readable on rooted phones).
            redactHeader("Authorization")
            redactHeader("X-Audience")
        }
        return OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(tokens))
            .authenticator(refreshAuthenticator)
            .addInterceptor(logging)
            .build()
    }

    fun retrofit(): Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttp())
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
}