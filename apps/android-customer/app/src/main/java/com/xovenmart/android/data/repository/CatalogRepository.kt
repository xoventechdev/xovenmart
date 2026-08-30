package com.xovenmart.android.data.repository

import com.xovenmart.android.data.api.CatalogApi
import com.xovenmart.android.data.mapper.toDetail
import com.xovenmart.android.data.mapper.toDomain
import com.xovenmart.android.data.mapper.toHit
import com.xovenmart.android.data.mapper.toSummaries
import com.xovenmart.android.data.network.toAppError
import com.xovenmart.android.domain.model.Category
import com.xovenmart.android.domain.model.DeliveryQuote
import com.xovenmart.android.domain.model.DeliveryZone
import com.xovenmart.android.domain.model.ProductDetail
import com.xovenmart.android.domain.model.ProductSearchHit
import com.xovenmart.android.domain.model.ProductSummary
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CatalogRepository @Inject constructor(
    private val api: CatalogApi,
) {
    suspend fun categories(rootOnly: Boolean = true): Result<List<Category>> = runCatching {
        api.categories(rootOnly = if (rootOnly) "true" else null).map { it.toDomain() }
    }.toAppResult()

    suspend fun category(slug: String): Result<Category> = runCatching {
        api.category(slug).toDomain()
    }.toAppResult()

    suspend fun featured(): Result<List<ProductSummary>> = runCatching {
        api.featuredProducts().toSummaries()
    }.toAppResult()

    suspend fun products(
        categorySlug: String? = null,
        q: String? = null,
        sort: String? = null,
        page: Int = 1,
        perPage: Int = 24,
        featured: Boolean = false,
    ): Result<List<ProductSummary>> = runCatching {
        api.products(
            categorySlug = categorySlug,
            q = q,
            sort = sort,
            page = page,
            perPage = perPage,
            featured = if (featured) "true" else null,
        ).toSummaries()
    }.toAppResult()

    suspend fun product(slug: String): Result<ProductDetail> = runCatching {
        api.product(slug).toDetail()
    }.toAppResult()

    suspend fun search(q: String, limit: Int = 10): Result<List<ProductSearchHit>> = runCatching {
        api.search(q, limit).results.map { it.toHit() }
    }.toAppResult()

    suspend fun deliveryZones(): Result<List<DeliveryZone>> = runCatching {
        api.deliveryZones().map { it.toDomain() }
    }.toAppResult()

    suspend fun deliveryFee(
        lat: Double,
        lng: Double,
        subtotal: Double,
        items: List<Pair<Int, Int?>>, // (qty, weightGrams?)
    ): Result<DeliveryQuote> = runCatching {
        val itemsJson: String = buildJsonArray {
            items.forEach { (qty, weight) ->
                add(buildJsonObject {
                    put("qty", JsonPrimitive(qty))
                    if (weight != null) put("weightGrams", JsonPrimitive(weight))
                })
            }
        }.toString()
        api.deliveryFee(lat, lng, subtotal, itemsJson).toDomain()
    }.toAppResult()
}

private inline fun <T> Result<T>.toAppResult(): Result<T> =
    recoverCatching { throw it.toAppError() }