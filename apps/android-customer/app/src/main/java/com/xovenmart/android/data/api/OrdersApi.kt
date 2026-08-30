package com.xovenmart.android.data.api

import com.xovenmart.android.data.dto.orders.OrderDto
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface OrdersApi {

    @GET("orders/mine")
    suspend fun mine(): List<OrderDto>

    @GET("orders/mine/{id}")
    suspend fun byId(@Path("id") id: String): OrderDto

    @GET("orders/track/{orderNo}")
    suspend fun track(
        @Path("orderNo") orderNo: String,
        @Query("phone") phone: String? = null,
    ): OrderDto
}