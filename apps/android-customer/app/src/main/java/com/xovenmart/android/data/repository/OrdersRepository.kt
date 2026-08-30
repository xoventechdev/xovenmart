package com.xovenmart.android.data.repository

import com.xovenmart.android.data.api.OrdersApi
import com.xovenmart.android.data.mapper.toDomain
import com.xovenmart.android.data.network.toAppError
import com.xovenmart.android.domain.model.Order
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrdersRepository @Inject constructor(
    private val api: OrdersApi,
) {
    suspend fun mine(): Result<List<Order>> = runCatching {
        api.mine().map { it.toDomain() }
    }.toAppResult()

    suspend fun byId(id: String): Result<Order> = runCatching {
        api.byId(id).toDomain()
    }.toAppResult()

    suspend fun track(orderNo: String, phone: String? = null): Result<Order> = runCatching {
        api.track(orderNo, phone).toDomain()
    }.toAppResult()
}

private inline fun <T> Result<T>.toAppResult(): Result<T> =
    recoverCatching { throw it.toAppError() }