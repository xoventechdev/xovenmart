package com.xovenmart.android.data.api

import com.xovenmart.android.data.dto.referrals.ReferralOverviewDto
import com.xovenmart.android.data.dto.referrals.ReferrerResponseDto
import retrofit2.http.GET

interface ReferralsApi {

    @GET("referrals/me")
    suspend fun mine(): ReferralOverviewDto

    @GET("referrals/referrer")
    suspend fun referrer(): ReferrerResponseDto
}