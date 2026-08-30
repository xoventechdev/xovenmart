package com.xovenmart.android.domain.model

data class DeliveryZone(
    val id: String,
    val nameBn: String,
    val nameEn: String,
    val centerLat: Double,
    val centerLng: Double,
    val radiusKm: Double,
    val baseKm: Double,
    val baseFee: Double,
    val perKmFee: Double,
    val perKgFee: Double,
    val heavyKgThreshold: Double?,
    val heavyKgFee: Double?,
    val freeAbove: Double?,
)

data class DeliveryQuote(
    val zoneId: String?,
    val zoneNameEn: String?,
    val zoneNameBn: String?,
    val distanceKm: Double?,
    val weightKg: Double,
    val deliveryFee: Int,
    val freeAbove: Double?,
    val freeDeliveryApplied: Boolean,
    val outsideAllZones: Boolean = false,
    val message: String? = null,
)