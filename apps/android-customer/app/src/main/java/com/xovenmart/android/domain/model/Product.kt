package com.xovenmart.android.domain.model

data class ProductSummary(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val unit: String,
    val mrp: Double,
    val salePrice: Double,
    val discountPct: Int,
    val isFeatured: Boolean,
    val isNew: Boolean,
    val image: String?,
    val inStock: Boolean,
    val category: ProductCategoryRef?,
)

data class ProductCategoryRef(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
)

data class ProductDetail(
    val summary: ProductSummary,
    val descriptionBn: String?,
    val descriptionEn: String?,
    val images: List<ProductImage>,
)

data class ProductImage(
    val url: String,
    val altBn: String?,
    val altEn: String?,
)

data class ProductSearchHit(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val price: Double,
    val mrp: Double,
    val image: String?,
)