package com.xovenmart.android.domain.model

enum class ReferralStatus(val wire: String) {
    PENDING("PENDING"),
    QUALIFIED("QUALIFIED"),
    REWARDED("REWARDED"),
    EXPIRED("EXPIRED");

    companion object {
        fun fromWire(s: String): ReferralStatus = entries.firstOrNull { it.wire == s } ?: PENDING
    }
}

data class ReferralRecord(
    val id: String,
    val refereeName: String?,
    val refereePhone: String?,
    val refereeJoinedAt: String?,
    val status: ReferralStatus,
    val rewardedAt: String?,
)

data class ReferralStats(
    val totalReferrals: Int,
    val pending: Int,
    val qualified: Int,
    val rewarded: Int,
    val totalRewardAmount: Double,
)

data class ReferralReward(
    val id: String,
    val couponCode: String,
    val amount: Double,
    val issuedAt: String?,
    val redeemedAt: String?,
)

data class ReferralOverview(
    val referralCode: String,
    val shareUrl: String,
    val shareMessage: String,
    val stats: ReferralStats,
    val referrals: List<ReferralRecord>,
    val rewards: List<ReferralReward>,
)