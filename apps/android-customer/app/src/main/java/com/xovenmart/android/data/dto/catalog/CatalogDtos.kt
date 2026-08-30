package com.xovenmart.android.data.dto.catalog

import kotlinx.serialization.Serializable

// ─── Categories ──────────────────────────────────────────────────────────────

@Serializable
data class CategoryDto(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val imageUrl: String? = null,
    val productCount: Int? = null,
    val sortOrder: Int? = null,
    val isActive: Boolean? = null,
    val parentId: String? = null,
    val children: List<CategoryDto> = emptyList(),
    val parent: CategoryDto? = null,
)

// ─── Products ───────────────────────────────────────────────────────────────

@Serializable
data class ProductCategoryRefDto(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
)

@Serializable
data class ProductSummaryDto(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val unit: String,
    val weightGrams: Int? = null,
    val mrp: Double,
    val salePrice: Double,
    val discountPct: Int,
    val isFeatured: Boolean,
    val isNew: Boolean,
    val category: ProductCategoryRefDto? = null,
    val image: String? = null,
    val inStock: Boolean,
)

@Serializable
data class PaginatedProductsDto(
    val items: List<ProductSummaryDto>,
    val page: Int,
    val perPage: Int,
    val total: Int,
    val totalPages: Int,
)

@Serializable
data class ProductImageDto(
    val url: String,
    val altBn: String? = null,
    val altEn: String? = null,
)

@Serializable
data class ProductDetailDto(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val unit: String,
    val weightGrams: Int? = null,
    val mrp: Double,
    val salePrice: Double,
    val discountPct: Int,
    val isFeatured: Boolean,
    val isNew: Boolean,
    val category: ProductCategoryRefDto? = null,
    val image: String? = null,
    val inStock: Boolean,
    val descriptionBn: String? = null,
    val descriptionEn: String? = null,
    val images: List<ProductImageDto> = emptyList(),
)

@Serializable
data class ProductSearchHitDto(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val price: Double,
    val mrp: Double,
    val image: String? = null,
)

@Serializable
data class ProductSearchResponseDto(
    val results: List<ProductSearchHitDto> = emptyList(),
)

// ─── Delivery ───────────────────────────────────────────────────────────────

@Serializable
data class DeliveryZoneDto(
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
    val heavyKgThreshold: Double? = null,
    val heavyKgFee: Double? = null,
    val freeAbove: Double? = null,
)

@Serializable
data class DeliveryFeeBreakdownDto(
    val distanceFee: Int,
    val weightFee: Int,
    val extraKm: Int,
)

@Serializable
data class DeliveryFeeRequest(
    val lat: Double,
    val lng: Double,
    val subtotal: Double,
    val items: List<DeliveryFeeItem>,
)

@Serializable
data class DeliveryFeeItem(
    val qty: Int,
    val weightGrams: Int? = null,
)

@Serializable
data class DeliveryFeeResponse(
    val zoneId: String? = null,
    val zoneNameEn: String? = null,
    val zoneNameBn: String? = null,
    val distanceKm: Double? = null,
    val weightKg: Double = 0.0,
    val baseKm: Double? = null,
    val baseFee: Double? = null,
    val perKmFee: Double? = null,
    val perKgFee: Double? = null,
    val heavyKgThreshold: Double? = null,
    val heavyKgFee: Double? = null,
    val deliveryFee: Int = 0,
    val freeAbove: Double? = null,
    val freeDeliveryApplied: Boolean = false,
    val breakdown: DeliveryFeeBreakdownDto? = null,
    val outsideAllZones: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)