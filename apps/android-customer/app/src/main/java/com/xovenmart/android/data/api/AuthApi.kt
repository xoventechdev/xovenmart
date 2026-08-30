package com.xovenmart.android.data.api

import com.xovenmart.android.data.dto.auth.ForgotPasswordRequest
import com.xovenmart.android.data.dto.auth.LoginRequest
import com.xovenmart.android.data.dto.auth.LoginResponse
import com.xovenmart.android.data.dto.auth.LogoutRequest
import com.xovenmart.android.data.dto.auth.OtpIssuedResponse
import com.xovenmart.android.data.dto.auth.RefreshRequest
import com.xovenmart.android.data.dto.auth.RefreshResponse
import com.xovenmart.android.data.dto.auth.RegisterRequest
import com.xovenmart.android.data.dto.auth.RequestOtpRequest
import com.xovenmart.android.data.dto.auth.ResetPasswordRequest
import com.xovenmart.android.data.dto.auth.ResetPasswordResponse
import com.xovenmart.android.data.dto.auth.VerifyOtpRequest
import com.xovenmart.android.data.dto.auth.VerifyOtpResponse
import com.xovenmart.android.data.dto.common.AuthMeResponseDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface AuthApi {

    @POST("auth/customer/request-otp")
    suspend fun requestOtp(@Body body: RequestOtpRequest): OtpIssuedResponse

    @POST("auth/customer/verify-otp")
    suspend fun verifyOtp(@Body body: VerifyOtpRequest): VerifyOtpResponse

    @POST("auth/customer/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("auth/customer/register")
    suspend fun register(@Body body: RegisterRequest): LoginResponse

    @POST("auth/customer/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): OtpIssuedResponse

    @POST("auth/customer/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): ResetPasswordResponse

    @POST("auth/customer/refresh")
    suspend fun refresh(@Body body: RefreshRequest): RefreshResponse

    @POST("auth/customer/logout")
    suspend fun logout(@Body body: LogoutRequest): Response<Unit>

    @GET("auth/me")
    suspend fun me(): AuthMeResponseDto
}