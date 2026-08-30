package com.xovenmart.android.domain.model

enum class OrderStatus(val wire: String) {
    PENDING("PENDING"),
    ACCEPTED("ACCEPTED"),
    PREPARING("PREPARING"),
    PREPARED("PREPARED"),
    OUT_FOR_DELIVERY("OUT_FOR_DELIVERY"),
    DELIVERED("DELIVERED"),
    CANCELLED("CANCELLED"),
    RETURNED("RETURNED"),
    REFUNDED("REFUNDED");

    companion object {
        fun fromWire(s: String): OrderStatus = entries.firstOrNull { it.wire == s } ?: PENDING
    }
}

data class OrderItem(
    val productId: String,
    val name: String,
    val qty: Int,
    val unitPrice: Double,
    val lineTotal: Double,
)

data class OrderStatusEvent(
    val from: String?,
    val to: String,
    val note: String?,
    val at: String, // ISO-8601
)

data class DeliveryInfo(
    val riderName: String?,
    val riderPhone: String?,
    val assignedAt: String?,
    val deliveredAt: String?,
    val proofStatus: String?,
)

data class Order(
    val id: String,
    val orderNo: String,
    val status: OrderStatus,
    val statusBn: String?,
    val subtotal: Double,
    val discountTotal: Double,
    val deliveryFee: Double,
    val grandTotal: Double,
    val paymentMethod: String,
    val paymentStatus: String?,
    val address: AddressSnapshot?,
    val guestName: String?,
    val guestPhone: String?,
    val couponCode: String?,
    val notes: String?,
    val items: List<OrderItem>,
    val delivery: DeliveryInfo?,
    val statusEvents: List<OrderStatusEvent>?,
    val placedAt: String?,
    val confirmedAt: String?,
    val deliveredAt: String?,
    val cancelledAt: String?,
)