package com.xovenmart.android.data.repository

import com.xovenmart.android.data.api.CheckoutApi
import com.xovenmart.android.data.dto.checkout.CheckoutAddress
import com.xovenmart.android.data.dto.checkout.CheckoutItem
import com.xovenmart.android.data.dto.checkout.CheckoutRequest
import com.xovenmart.android.data.mapper.toDomain
import com.xovenmart.android.data.network.toAppError
import com.xovenmart.android.domain.model.AddressSnapshot
import com.xovenmart.android.domain.model.CartPriceQuote
import com.xovenmart.android.domain.model.Order
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CheckoutRepository @Inject constructor(
    private val api: CheckoutApi,
) {
    suspend fun place(
        items: List<Pair<String, Int>>,          // (productId, qty)
        address: AddressSnapshot,
        couponCode: String? = null,
        notes: String? = null,
        guestName: String? = null,
        guestPhone: String? = null,
    ): Result<Order> = runCatching {
        val req = CheckoutRequest(
            guestPhone = guestPhone,
            guestName = guestName,
            address = CheckoutAddress(
                label = address.label,
                area = address.area,
                landmark = address.landmark,
                fullText = address.fullText,
                lat = address.lat,
                lng = address.lng,
            ),
            items = items.map { (id, q) -> CheckoutItem(id, q) },
            couponCode = couponCode,
            paymentMethod = "COD",
            notes = notes,
        )
        api.checkout(req).order.toDomain()
    }.toAppResult()

    suspend fun price(
        items: List<Pair<String, Int>>,
        couponCode: String? = null,
    ): Result<CartPriceQuote> = runCatching {
        val res = api.cartPrice(
            com.xovenmart.android.data.dto.checkout.CartPriceRequest(
                items = items.map { (id, q) -> CheckoutItem(id, q) },
                couponCode = couponCode,
            )
        )
        CartPriceQuote(
            items = res.items.map {
                com.xovenmart.android.domain.model.PricedCartItem(
                    productId = it.productId, slug = it.slug, nameBn = it.nameBn, nameEn = it.nameEn,
                    unit = it.unit, qty = it.qty, unitPrice = it.unitPrice, mrp = it.mrp,
                    lineTotal = it.lineTotal, image = it.image, inStock = it.inStock,
                )
            },
            subtotal = res.subtotal,
            discountTotal = res.discountTotal,
            deliveryFee = res.deliveryFee,
            grandTotal = res.grandTotal,
            itemCount = res.itemCount,
            coupon = res.coupon?.toDomain(),
            errors = res.errors,
        )
    }.toAppResult()
}

private inline fun <T> Result<T>.toAppResult(): Result<T> =
    recoverCatching { throw it.toAppError() }