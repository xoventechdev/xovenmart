package com.xovenmart.android.data.network

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Adds `Authorization: Bearer <token>` to every outgoing request,
 * skipping the refresh endpoint itself (the body carries the refresh
 * token, no header is wanted). Also tags the request with the audience
 * header so the backend's [NestJS RolesGuard] can dispatch the right
 * JWT audience.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokens: SecureTokenStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val skip = original.url.encodedPath.contains("/auth/customer/refresh")
        val builder = original.newBuilder()
            .header("X-Audience", tokens.audience())
        if (!skip) {
            tokens.access()?.let { builder.header("Authorization", "Bearer $it") }
        }
        return chain.proceed(builder.build())
    }
}