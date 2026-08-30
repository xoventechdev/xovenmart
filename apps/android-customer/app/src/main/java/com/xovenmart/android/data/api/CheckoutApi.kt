package com.xovenmart.android.data.api

import com.xovenmart.android.data.dto.checkout.CartPriceRequest
import com.xovenmart.android.data.dto.checkout.CartPriceResponseDto
import com.xovenmart.android.data.dto.checkout.CheckoutRequest
import com.xovenmart.android.data.dto.checkout.CheckoutResponseDto
import retrofit2.http.Body
import retrofit2.http.POST

interface CheckoutApi {

    @POST("checkout")
    suspend fun checkout(@Body body: CheckoutRequest): CheckoutResponseDto

    @POST("cart/price")
    suspend fun cartPrice(@Body body: CartPriceRequest): CartPriceResponseDto
}