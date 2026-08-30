package com.xovenmart.android.data.dto.customers

import kotlinx.serialization.Serializable

@Serializable
data class AddressDto(
    val id: String,
    val userId: String,
    val label: String? = null,
    val area: String,
    val landmark: String? = null,
    val fullText: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val isDefault: Boolean,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

@Serializable
data class CustomerProfileEnvelopeDto(val user: UserEnvelopeDto)

@Serializable
data class UserEnvelopeDto(
    val id: String,
    val phone: String,
    val name: String,
    val email: String? = null,
    val referralCode: String,
    val registeredAt: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class UpdateProfileRequest(
    val name: String,
    val email: String? = null,
)

@Serializable
data class AddressListResponseDto(val addresses: List<AddressDto>)

@Serializable
data class AddressEnvelopeDto(val address: AddressDto)

@Serializable
data class CreateAddressRequest(
    val label: String? = null,
    val area: String,
    val landmark: String? = null,
    val fullText: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val isDefault: Boolean? = null,
)

@Serializable
data class UpdateAddressRequest(
    val label: String? = null,
    val area: String? = null,
    val landmark: String? = null,
    val fullText: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val isDefault: Boolean? = null,
)

@Serializable
data class OkResponseDto(val ok: Boolean = true)