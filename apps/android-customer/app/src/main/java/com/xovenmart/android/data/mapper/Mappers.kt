package com.xovenmart.android.data.mapper

import com.xovenmart.android.data.dto.common.UserDto
import com.xovenmart.android.data.dto.common.UserWithCountDto
import com.xovenmart.android.data.dto.customers.AddressDto
import com.xovenmart.android.data.dto.customers.UserEnvelopeDto
import com.xovenmart.android.domain.model.Address
import com.xovenmart.android.domain.model.CustomerProfile

fun UserDto.toProfile(): CustomerProfile = CustomerProfile(
    id = id,
    phone = phone,
    name = name,
    email = email,
    referralCode = referralCode,
    referredById = referredById,
)

fun UserWithCountDto.toProfile(): CustomerProfile = CustomerProfile(
    id = id,
    phone = phone,
    name = name,
    email = email,
    referralCode = referralCode,
    referredById = referredById,
)

fun UserEnvelopeDto.toProfile(): CustomerProfile = CustomerProfile(
    id = id,
    phone = phone,
    name = name,
    email = email,
    referralCode = referralCode,
)

fun AddressDto.toDomain(): Address = Address(
    id = id,
    userId = userId,
    label = label,
    area = area,
    landmark = landmark,
    fullText = fullText,
    lat = lat,
    lng = lng,
    isDefault = isDefault,
)