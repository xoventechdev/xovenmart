package com.xovenmart.android.data.api

import com.xovenmart.android.data.dto.catalog.CategoryDto
import com.xovenmart.android.data.dto.catalog.DeliveryFeeRequest
import com.xovenmart.android.data.dto.catalog.DeliveryFeeResponse
import com.xovenmart.android.data.dto.catalog.DeliveryZoneDto
import com.xovenmart.android.data.dto.catalog.PaginatedProductsDto
import com.xovenmart.android.data.dto.catalog.ProductDetailDto
import com.xovenmart.android.data.dto.catalog.ProductSearchResponseDto
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface CatalogApi {

    @GET("catalog/categories")
    suspend fun categories(
        @Query("includeChildren") includeChildren: String? = null,
        @Query("rootOnly") rootOnly: String? = null,
    ): List<CategoryDto>

    @GET("catalog/categories/{slug}")
    suspend fun category(@Path("slug") slug: String): CategoryDto

    @GET("catalog/products")
    suspend fun products(
        @Query("category") categorySlug: String? = null,
        @Query("q") q: String? = null,
        @Query("sort") sort: String? = null,
        @Query("page") page: Int = 1,
        @Query("perPage") perPage: Int = 24,
        @Query("featured") featured: String? = null,
    ): PaginatedProductsDto

    @GET("catalog/products/featured")
    suspend fun featuredProducts(): PaginatedProductsDto

    @GET("catalog/products/{slug}")
    suspend fun product(@Path("slug") slug: String): ProductDetailDto

    @GET("catalog/search")
    suspend fun search(
        @Query("q") q: String? = null,
        @Query("limit") limit: Int = 10,
    ): ProductSearchResponseDto

    @GET("catalog/delivery-zones")
    suspend fun deliveryZones(): List<DeliveryZoneDto>

    @GET("catalog/delivery-fee")
    suspend fun deliveryFee(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("subtotal") subtotal: Double,
        @Query("items") items: String, // JSON-encoded [{qty, weightGrams}]
    ): DeliveryFeeResponse
}