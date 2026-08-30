package com.xovenmart.android.data.repository

import com.xovenmart.android.data.api.CustomerApi
import com.xovenmart.android.data.dto.customers.CreateAddressRequest
import com.xovenmart.android.data.dto.customers.UpdateAddressRequest
import com.xovenmart.android.data.dto.customers.UpdateProfileRequest
import com.xovenmart.android.data.mapper.toDomain
import com.xovenmart.android.data.mapper.toProfile
import com.xovenmart.android.data.network.toAppError
import com.xovenmart.android.domain.model.Address
import com.xovenmart.android.domain.model.CustomerProfile
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CustomerRepository @Inject constructor(
    private val api: CustomerApi,
) {
    suspend fun profile(): Result<CustomerProfile> = runCatching {
        api.me().user.toProfile()
    }.toAppResult()

    suspend fun updateProfile(name: String, email: String?): Result<CustomerProfile> = runCatching {
        api.updateProfile(UpdateProfileRequest(name = name, email = email)).user.toProfile()
    }.toAppResult()

    suspend fun addresses(): Result<List<Address>> = runCatching {
        api.addresses().addresses.map { it.toDomain() }
    }.toAppResult()

    suspend fun createAddress(
        label: String?,
        area: String,
        landmark: String?,
        fullText: String,
        lat: Double?,
        lng: Double?,
        isDefault: Boolean?,
    ): Result<Address> = runCatching {
        api.createAddress(
            CreateAddressRequest(label, area, landmark, fullText, lat, lng, isDefault)
        ).address.toDomain()
    }.toAppResult()

    suspend fun updateAddress(
        id: String,
        label: String? = null,
        area: String? = null,
        landmark: String? = null,
        fullText: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        isDefault: Boolean? = null,
    ): Result<Address> = runCatching {
        api.updateAddress(
            id,
            UpdateAddressRequest(label, area, landmark, fullText, lat, lng, isDefault)
        ).address.toDomain()
    }.toAppResult()

    suspend fun deleteAddress(id: String): Result<Unit> = runCatching {
        api.deleteAddress(id); Unit
    }.toAppResult()
}

private inline fun <T> Result<T>.toAppResult(): Result<T> =
    recoverCatching { throw it.toAppError() }