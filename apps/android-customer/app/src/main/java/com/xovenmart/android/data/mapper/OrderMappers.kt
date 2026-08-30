package com.xovenmart.android.data.mapper

import com.xovenmart.android.data.dto.checkout.CheckoutOrderDto
import com.xovenmart.android.data.dto.checkout.CouponResultDto
import com.xovenmart.android.data.dto.orders.AddressSnapshotDto
import com.xovenmart.android.data.dto.orders.DeliveryInfoDto
import com.xovenmart.android.data.dto.orders.OrderDto
import com.xovenmart.android.data.dto.orders.OrderItemDto
import com.xovenmart.android.data.dto.orders.OrderStatusEventDto
import com.xovenmart.android.domain.model.AddressSnapshot
import com.xovenmart.android.domain.model.CouponResult
import com.xovenmart.android.domain.model.CouponType
import com.xovenmart.android.domain.model.DeliveryInfo
import com.xovenmart.android.domain.model.Order
import com.xovenmart.android.domain.model.OrderItem
import com.xovenmart.android.domain.model.OrderStatus
import com.xovenmart.android.domain.model.OrderStatusEvent

fun OrderItemDto.toDomain() = OrderItem(
    productId = productId, name = name, qty = qty,
    unitPrice = unitPrice, lineTotal = lineTotal,
)

fun OrderStatusEventDto.toDomain() = OrderStatusEvent(
    from = from, to = to, note = note, at = at,
)

fun DeliveryInfoDto.toDomain() = DeliveryInfo(
    riderName = riderName, riderPhone = riderPhone,
    assignedAt = assignedAt, deliveredAt = deliveredAt, proofStatus = proofStatus,
)

fun AddressSnapshotDto.toDomain(): AddressSnapshot? {
    // Tracking may redact fullText/landmark/lat/lng; only render what we have.
    val areaSafe = area ?: return null
    return AddressSnapshot(
        label = label,
        area = areaSafe,
        landmark = landmark,
        fullText = fullText ?: areaSafe,
        lat = lat ?: 0.0,
        lng = lng ?: 0.0,
    )
}

fun OrderDto.toDomain() = Order(
    id = id,
    orderNo = orderNo,
    status = OrderStatus.fromWire(status),
    statusBn = statusBn,
    subtotal = subtotal,
    discountTotal = discountTotal,
    deliveryFee = deliveryFee,
    grandTotal = grandTotal,
    paymentMethod = paymentMethod,
    paymentStatus = paymentStatus,
    address = address?.toDomain(),
    guestName = guestName,
    guestPhone = guestPhone,
    couponCode = couponCode,
    notes = notes,
    items = items.map { it.toDomain() },
    delivery = delivery?.toDomain(),
    statusEvents = if (statusEvents.isEmpty()) null else statusEvents.map { it.toDomain() },
    placedAt = placedAt,
    confirmedAt = confirmedAt,
    deliveredAt = deliveredAt,
    cancelledAt = cancelledAt,
)

fun CouponResultDto.toDomain() = CouponResult(
    code = code,
    type = CouponType.fromWire(type),
    discountAmount = discountAmount,
)

/** Checkout success view — a leaner Order with just the essentials. */
fun CheckoutOrderDto.toDomain() = Order(
    id = id,
    orderNo = orderNo,
    status = OrderStatus.fromWire(status),
    statusBn = null,
    subtotal = subtotal,
    discountTotal = discountTotal,
    deliveryFee = deliveryFee,
    grandTotal = grandTotal,
    paymentMethod = paymentMethod,
    paymentStatus = null,
    address = null,
    guestName = null,
    guestPhone = null,
    couponCode = null,
    notes = null,
    items = items.map { dto ->
        OrderItem(
            productId = dto.productId,
            name = dto.name,
            qty = dto.qty,
            unitPrice = dto.unitPrice,
            lineTotal = dto.lineTotal,
        )
    },
    delivery = null,
    statusEvents = null,
    placedAt = createdAt,
    confirmedAt = null,
    deliveredAt = null,
    cancelledAt = null,
)