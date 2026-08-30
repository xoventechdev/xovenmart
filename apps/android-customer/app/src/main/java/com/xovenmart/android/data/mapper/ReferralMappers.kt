package com.xovenmart.android.data.mapper

import com.xovenmart.android.data.dto.referrals.ReferralOverviewDto
import com.xovenmart.android.data.dto.referrals.ReferralRecordDto
import com.xovenmart.android.data.dto.referrals.ReferralRewardDto
import com.xovenmart.android.data.dto.referrals.ReferralStatsDto
import com.xovenmart.android.domain.model.ReferralOverview
import com.xovenmart.android.domain.model.ReferralRecord
import com.xovenmart.android.domain.model.ReferralReward
import com.xovenmart.android.domain.model.ReferralStats
import com.xovenmart.android.domain.model.ReferralStatus

fun ReferralStatsDto.toDomain() = ReferralStats(
    totalReferrals = totalReferrals,
    pending = pending,
    qualified = qualified,
    rewarded = rewarded,
    totalRewardAmount = totalRewardAmount,
)

fun ReferralRecordDto.toDomain() = ReferralRecord(
    id = id,
    refereeName = refereeName,
    refereePhone = refereePhone,
    refereeJoinedAt = refereeJoinedAt,
    status = ReferralStatus.fromWire(status),
    rewardedAt = rewardedAt,
)

fun ReferralRewardDto.toDomain() = ReferralReward(
    id = id,
    couponCode = couponCode,
    amount = amount,
    issuedAt = issuedAt,
    redeemedAt = redeemedAt,
)

fun ReferralOverviewDto.toDomain() = ReferralOverview(
    referralCode = referralCode,
    shareUrl = shareUrl,
    shareMessage = shareMessage,
    stats = stats.toDomain(),
    referrals = referrals.map { it.toDomain() },
    rewards = rewards.map { it.toDomain() },
)