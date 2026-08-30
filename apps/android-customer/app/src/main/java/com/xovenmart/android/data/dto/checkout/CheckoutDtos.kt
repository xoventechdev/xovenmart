package com.xovenmart.android.data.dto.checkout

import kotlinx.serialization.Serializable

@Serializable
data class CheckoutItem(val productId: String, val qty: Int)

@Serializable
data class CheckoutAddress(
    val label: String? = null,
    val area: String,
    val landmark: String? = null,
    val fullText: String,
    val lat: Double,
    val lng: Double,
)

@Serializable
data class CheckoutRequest(
    val guestPhone: String? = null,
    val guestName: String? = null,
    val address: CheckoutAddress,
    val items: List<CheckoutItem>,
    val couponCode: String? = null,
    val paymentMethod: String = "COD",
    val notes: String? = null,
)

@Serializable
data class CheckoutOrderItemDto(
    val productId: String,
    val name: String,
    val qty: Int,
    val unitPrice: Double,
    val lineTotal: Double,
)

@Serializable
data class CheckoutOrderDto(
    val id: String,
    val orderNo: String,
    val status: String,
    val grandTotal: Double,
    val subtotal: Double,
    val discountTotal: Double,
    val deliveryFee: Double,
    val paymentMethod: String,
    val createdAt: String,
    val items: List<CheckoutOrderItemDto>,
)

@Serializable
data class CheckoutResponseDto(
    val ok: Boolean = true,
    val order: CheckoutOrderDto,
)

// ─── Cart price preview ─────────────────────────────────────────────────────

@Serializable
data class CartPriceItemDto(
    val productId: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val unit: String,
    val qty: Int,
    val unitPrice: Double,
    val mrp: Double,
    val lineTotal: Double,
    val image: String? = null,
    val inStock: Boolean,
)

@Serializable
data class CouponResultDto(
    val code: String,
    val type: String,
    val discountAmount: Double,
    val scope: String? = null,
)

@Serializable
data class CartPriceRequest(
    val items: List<CheckoutItem>,
    val couponCode: String? = null,
)

@Serializable
data class CartPriceResponseDto(
    val items: List<CartPriceItemDto> = emptyList(),
    val subtotal: Double = 0.0,
    val discountTotal: Double = 0.0,
    val deliveryFee: Double = 0.0,
    val grandTotal: Double = 0.0,
    val itemCount: Int = 0,
    val coupon: CouponResultDto? = null,
    val errors: List<String> = emptyList(),
)