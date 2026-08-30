package com.xovenmart.android.data.repository

import com.xovenmart.android.data.api.ReferralsApi
import com.xovenmart.android.data.mapper.toDomain
import com.xovenmart.android.data.network.toAppError
import com.xovenmart.android.domain.model.ReferralOverview
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReferralsRepository @Inject constructor(
    private val api: ReferralsApi,
) {
    suspend fun overview(): Result<ReferralOverview> = runCatching {
        api.mine().toDomain()
    }.toAppResult()
}

private inline fun <T> Result<T>.toAppResult(): Result<T> =
    recoverCatching { throw it.toAppError() }