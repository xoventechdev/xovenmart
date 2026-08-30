package com.xovenmart.android.domain.model

/** Outcome of `POST /cart/price` when a coupon is valid. */
data class CouponResult(
    val code: String,
    val type: CouponType,
    val discountAmount: Double,
)

enum class CouponType(val wire: String) {
    PERCENT("PERCENT"),
    FLAT("FLAT"),
    FREE_DELIVERY("FREE_DELIVERY");

    companion object {
        fun fromWire(s: String): CouponType = entries.firstOrNull { it.wire == s } ?: PERCENT
    }
}

/** Server-priced cart item, returned by `POST /cart/price`. */
data class PricedCartItem(
    val productId: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val unit: String,
    val qty: Int,
    val unitPrice: Double,
    val mrp: Double,
    val lineTotal: Double,
    val image: String?,
    val inStock: Boolean,
)

data class CartPriceQuote(
    val items: List<PricedCartItem>,
    val subtotal: Double,
    val discountTotal: Double,
    val deliveryFee: Double,
    val grandTotal: Double,
    val itemCount: Int,
    val coupon: CouponResult?,
    val errors: List<String>,
)