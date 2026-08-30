package com.xovenmart.android.data.api

import com.xovenmart.android.data.dto.customers.AddressEnvelopeDto
import com.xovenmart.android.data.dto.customers.AddressListResponseDto
import com.xovenmart.android.data.dto.customers.CreateAddressRequest
import com.xovenmart.android.data.dto.customers.CustomerProfileEnvelopeDto
import com.xovenmart.android.data.dto.customers.OkResponseDto
import com.xovenmart.android.data.dto.customers.UpdateAddressRequest
import com.xovenmart.android.data.dto.customers.UpdateProfileRequest
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

interface CustomerApi {

    @GET("customers/me")
    suspend fun me(): CustomerProfileEnvelopeDto

    @PATCH("customers/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): CustomerProfileEnvelopeDto

    @GET("customers/me/addresses")
    suspend fun addresses(): AddressListResponseDto

    @POST("customers/me/addresses")
    suspend fun createAddress(@Body body: CreateAddressRequest): AddressEnvelopeDto

    @PATCH("customers/me/addresses/{id}")
    suspend fun updateAddress(
        @Path("id") id: String,
        @Body body: UpdateAddressRequest,
    ): AddressEnvelopeDto

    @DELETE("customers/me/addresses/{id}")
    suspend fun deleteAddress(@Path("id") id: String): OkResponseDto
}