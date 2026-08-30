package com.xovenmart.android.data.mapper

import com.xovenmart.android.data.dto.catalog.CategoryDto
import com.xovenmart.android.data.dto.catalog.DeliveryFeeResponse
import com.xovenmart.android.data.dto.catalog.DeliveryZoneDto
import com.xovenmart.android.data.dto.catalog.PaginatedProductsDto
import com.xovenmart.android.data.dto.catalog.ProductCategoryRefDto
import com.xovenmart.android.data.dto.catalog.ProductDetailDto
import com.xovenmart.android.data.dto.catalog.ProductImageDto
import com.xovenmart.android.data.dto.catalog.ProductSearchHitDto
import com.xovenmart.android.data.dto.catalog.ProductSummaryDto
import com.xovenmart.android.domain.model.Category
import com.xovenmart.android.domain.model.DeliveryQuote
import com.xovenmart.android.domain.model.DeliveryZone
import com.xovenmart.android.domain.model.ProductCategoryRef
import com.xovenmart.android.domain.model.ProductDetail
import com.xovenmart.android.domain.model.ProductImage
import com.xovenmart.android.domain.model.ProductSearchHit
import com.xovenmart.android.domain.model.ProductSummary

fun ProductCategoryRefDto.toDomain() = ProductCategoryRef(
    id = id, slug = slug, nameBn = nameBn, nameEn = nameEn,
)

fun ProductSummaryDto.toSummary() = ProductSummary(
    id = id,
    slug = slug,
    nameBn = nameBn,
    nameEn = nameEn,
    unit = unit,
    mrp = mrp,
    salePrice = salePrice,
    discountPct = discountPct,
    isFeatured = isFeatured,
    isNew = isNew,
    image = image,
    inStock = inStock,
    category = category?.toDomain(),
)

fun ProductImageDto.toDomain() = ProductImage(url = url, altBn = altBn, altEn = altEn)

fun ProductDetailDto.toDetail() = ProductDetail(
    summary = ProductSummary(
        id = id,
        slug = slug,
        nameBn = nameBn,
        nameEn = nameEn,
        unit = unit,
        mrp = mrp,
        salePrice = salePrice,
        discountPct = discountPct,
        isFeatured = isFeatured,
        isNew = isNew,
        image = image,
        inStock = inStock,
        category = category?.toDomain(),
    ),
    descriptionBn = descriptionBn,
    descriptionEn = descriptionEn,
    images = images.map { it.toDomain() },
)

fun ProductSearchHitDto.toHit() = ProductSearchHit(
    id = id, slug = slug, nameBn = nameBn, nameEn = nameEn,
    price = price, mrp = mrp, image = image,
)

fun PaginatedProductsDto.toSummaries(): List<ProductSummary> = items.map { it.toSummary() }

fun CategoryDto.toDomain(): Category = Category(
    id = id,
    slug = slug,
    nameBn = nameBn,
    nameEn = nameEn,
    imageUrl = imageUrl,
    productCount = productCount ?: 0,
    children = children.map { it.toDomain() },
)

fun DeliveryZoneDto.toDomain() = DeliveryZone(
    id = id, nameBn = nameBn, nameEn = nameEn,
    centerLat = centerLat, centerLng = centerLng, radiusKm = radiusKm,
    baseKm = baseKm, baseFee = baseFee, perKmFee = perKmFee, perKgFee = perKgFee,
    heavyKgThreshold = heavyKgThreshold, heavyKgFee = heavyKgFee, freeAbove = freeAbove,
)

fun DeliveryFeeResponse.toDomain() = DeliveryQuote(
    zoneId = zoneId,
    zoneNameEn = zoneNameEn,
    zoneNameBn = zoneNameBn,
    distanceKm = distanceKm,
    weightKg = weightKg,
    deliveryFee = deliveryFee,
    freeAbove = freeAbove,
    freeDeliveryApplied = freeDeliveryApplied,
    outsideAllZones = outsideAllZones,
    message = message,
)