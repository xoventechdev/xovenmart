package com.xovenmart.android.data.repository

import com.xovenmart.android.data.api.AuthApi
import com.xovenmart.android.data.dto.auth.ForgotPasswordRequest
import com.xovenmart.android.data.dto.auth.LoginRequest
import com.xovenmart.android.data.dto.auth.LogoutRequest
import com.xovenmart.android.data.dto.auth.RegisterRequest
import com.xovenmart.android.data.dto.auth.RequestOtpRequest
import com.xovenmart.android.data.dto.auth.ResetPasswordRequest
import com.xovenmart.android.data.dto.auth.VerifyOtpRequest
import com.xovenmart.android.data.dto.auth.VerifyOtpResponse
import com.xovenmart.android.data.mapper.toProfile
import com.xovenmart.android.data.network.SecureTokenStore
import com.xovenmart.android.data.network.toAppError
import com.xovenmart.android.domain.model.CustomerProfile
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: AuthApi,
    private val tokens: SecureTokenStore,
) {
    suspend fun requestOtp(phone: String): Result<*> =
        runCatching { api.requestOtp(RequestOtpRequest(phone)) }.toAppResult()

    suspend fun verifyOtp(phone: String, code: String): Result<VerifyOtpResponse> =
        runCatching { api.verifyOtp(VerifyOtpRequest(phone, code)) }.toAppResult()

    suspend fun login(phone: String, password: String): Result<CustomerProfile> = runCatching {
        val res = api.login(LoginRequest(phone, password))
        tokens.save(res.accessToken, res.refreshToken)
        res.user.toProfile()
    }.toAppResult()

    suspend fun register(
        phone: String,
        name: String,
        password: String,
        email: String? = null,
        otpCode: String? = null,
        referralCode: String? = null,
    ): Result<CustomerProfile> = runCatching {
        val res = api.register(RegisterRequest(phone, name, password, email, otpCode, referralCode))
        tokens.save(res.accessToken, res.refreshToken)
        res.user.toProfile()
    }.toAppResult()

    suspend fun forgotPassword(phone: String): Result<*> =
        runCatching { api.forgotPassword(ForgotPasswordRequest(phone)) }.toAppResult()

    suspend fun resetPassword(phone: String, otpCode: String, newPassword: String): Result<CustomerProfile> = runCatching {
        val res = api.resetPassword(ResetPasswordRequest(phone, otpCode, newPassword))
        tokens.save(res.accessToken, res.refreshToken)
        res.user.toProfile()
    }.toAppResult()

    suspend fun me(): Result<CustomerProfile> = runCatching {
        api.me().user.toProfile()
    }.toAppResult()

    suspend fun logout() {
        val refresh = tokens.refresh()
        if (refresh != null) {
            runCatching { api.logout(LogoutRequest(refresh)) }
        }
        tokens.clear()
    }

    fun hasSession(): Boolean = tokens.access() != null
}

/** Collapse any exception thrown inside a [runCatching] to a typed [AppError]. */
private inline fun <T> Result<T>.toAppResult(): Result<T> =
    recoverCatching { throw it.toAppError() }