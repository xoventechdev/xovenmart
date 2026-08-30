package com.xovenmart.android.data.dto.auth

import com.xovenmart.android.data.dto.common.TokenPairDto
import com.xovenmart.android.data.dto.common.UserDto
import kotlinx.serialization.Serializable

@Serializable
data class RequestOtpRequest(val phone: String)

@Serializable
data class OtpIssuedResponse(
    val ok: Boolean = true,
    val message: String,
    val expiresAt: String,
    val devCode: String? = null,
)

@Serializable
data class VerifyOtpRequest(val phone: String, val code: String)

@Serializable
data class VerifyOtpResponse(
    val ok: Boolean,
    val phoneVerified: Boolean,
    val registrationRequired: Boolean = false,
    val firstTimeSetupRequired: Boolean = false,
    val phone: String? = null,
    val message: String? = null,
    val user: UserDto? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val expiresAt: String? = null,
)

@Serializable
data class LoginRequest(val phone: String, val password: String)

@Serializable
data class LoginResponse(
    val ok: Boolean = true,
    val user: UserDto,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String,
)

@Serializable
data class RegisterRequest(
    val phone: String,
    val name: String,
    val password: String,
    val email: String? = null,
    val otpCode: String? = null,
    val referralCode: String? = null,
)

@Serializable
data class ForgotPasswordRequest(val phone: String)

@Serializable
data class ResetPasswordRequest(
    val phone: String,
    val otpCode: String,
    val newPassword: String,
)

@Serializable
data class ResetPasswordResponse(
    val ok: Boolean = true,
    val user: UserDto,
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class RefreshResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String,
)

@Serializable
data class LogoutRequest(val refreshToken: String)