package com.xovenmart.android.domain.model

import java.util.UUID

/**
 * Client-side cart item. Cart state is mirrored to DataStore so it
 * survives process death — no backend cart in v1.
 */
data class CartItem(
    val id: String = UUID.randomUUID().toString(),
    val productId: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val unit: String,
    val qty: Int,
    val unitPrice: Double,
    val mrp: Double,
    val image: String?,
    val inStock: Boolean,
)

data class CartState(
    val items: List<CartItem> = emptyList(),
) {
    val totalItems: Int get() = items.sumOf { it.qty }
    val subtotal: Double get() = items.sumOf { it.unitPrice * it.qty }
    val mrpTotal: Double get() = items.sumOf { it.mrp * it.qty }
    val totalSavings: Double get() = (mrpTotal - subtotal).coerceAtLeast(0.0)
}