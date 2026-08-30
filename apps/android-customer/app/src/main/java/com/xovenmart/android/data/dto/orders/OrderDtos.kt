package com.xovenmart.android.data.dto.orders

import kotlinx.serialization.Serializable

@Serializable
data class OrderItemDto(
    val productId: String,
    val name: String,
    val qty: Int,
    val unitPrice: Double,
    val lineTotal: Double,
)

@Serializable
data class AddressSnapshotDto(
    val label: String? = null,
    val area: String? = null,
    val fullText: String? = null,
    val landmark: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
)

@Serializable
data class DeliveryInfoDto(
    val riderName: String? = null,
    val riderPhone: String? = null,
    val assignedAt: String? = null,
    val deliveredAt: String? = null,
    val proofStatus: String? = null,
)

@Serializable
data class OrderStatusEventDto(
    val from: String? = null,
    val to: String,
    val note: String? = null,
    val at: String,
)

@Serializable
data class OrderDto(
    val id: String,
    val orderNo: String,
    val status: String,
    val statusBn: String? = null,
    val subtotal: Double,
    val discountTotal: Double,
    val deliveryFee: Double,
    val grandTotal: Double,
    val paymentMethod: String,
    val paymentStatus: String? = null,
    val address: AddressSnapshotDto? = null,
    val guestName: String? = null,
    val guestPhone: String? = null,
    val couponCode: String? = null,
    val notes: String? = null,
    val items: List<OrderItemDto> = emptyList(),
    val delivery: DeliveryInfoDto? = null,
    val statusEvents: List<OrderStatusEventDto> = emptyList(),
    val placedAt: String? = null,
    val confirmedAt: String? = null,
    val deliveredAt: String? = null,
    val cancelledAt: String? = null,
)

@Serializable
data class TrackOrderResponseDto(
    val id: String,
    val orderNo: String,
    val status: String,
    val statusBn: String? = null,
    val subtotal: Double,
    val discountTotal: Double,
    val deliveryFee: Double,
    val grandTotal: Double,
    val paymentMethod: String,
    val paymentStatus: String? = null,
    val address: AddressSnapshotDto? = null,
    val guestName: String? = null,
    val guestPhone: String? = null,
    val couponCode: String? = null,
    val notes: String? = null,
    val items: List<OrderItemDto> = emptyList(),
    val delivery: DeliveryInfoDto? = null,
    val statusEvents: List<OrderStatusEventDto> = emptyList(),
    val placedAt: String? = null,
    val confirmedAt: String? = null,
    val deliveredAt: String? = null,
    val cancelledAt: String? = null,
)

@Serializable
data class TrackErrorResponseDto(val message: String)