package com.xovenmart.android.data.dto.referrals

import kotlinx.serialization.Serializable

@Serializable
data class ReferralRecordDto(
    val id: String,
    val refereeName: String? = null,
    val refereePhone: String? = null,
    val refereeJoinedAt: String? = null,
    val status: String,
    val rewardedAt: String? = null,
)

@Serializable
data class ReferralStatsDto(
    val totalReferrals: Int,
    val pending: Int,
    val qualified: Int,
    val rewarded: Int,
    val totalRewardAmount: Double,
)

@Serializable
data class ReferralRewardDto(
    val id: String,
    val couponCode: String,
    val amount: Double,
    val issuedAt: String? = null,
    val redeemedAt: String? = null,
)

@Serializable
data class ReferralOverviewDto(
    val referralCode: String,
    val shareUrl: String,
    val shareMessage: String,
    val stats: ReferralStatsDto,
    val referrals: List<ReferralRecordDto> = emptyList(),
    val rewards: List<ReferralRewardDto> = emptyList(),
)

@Serializable
data class ReferrerDto(
    val name: String,
    val referralCode: String,
)

@Serializable
data class ReferrerResponseDto(val referrer: ReferrerDto? = null)