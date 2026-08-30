package com.xovenmart.android.data.dto.common

import kotlinx.serialization.Serializable

/** Common shape for token issuance across auth + reset + refresh. */
@Serializable
data class TokenPairDto(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String, // ISO-8601
)

/** Customer-shaped user object returned by login/register/refresh-reset/me. */
@Serializable
data class UserDto(
    val id: String,
    val phone: String,
    val name: String,
    val email: String? = null,
    val referralCode: String,
    val referredById: String? = null,
    val registeredAt: String? = null,
    val createdAt: String? = null,
)

/** `/auth/me` customer view — same as `UserDto` plus a `_count` block. */
@Serializable
data class AuthMeResponseDto(
    val role: String,
    val user: UserWithCountDto,
)

@Serializable
data class UserWithCountDto(
    val id: String,
    val phone: String,
    val name: String,
    val email: String? = null,
    val referralCode: String,
    val referredById: String? = null,
    val registeredAt: String? = null,
    val createdAt: String? = null,
    val count: CountDto? = null,
)

@Serializable
data class CountDto(
    val orders: Int = 0,
    val addresses: Int = 0,
    val referralsMade: Int = 0,
    val rewards: Int = 0,
)