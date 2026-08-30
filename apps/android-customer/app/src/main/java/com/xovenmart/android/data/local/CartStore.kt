package com.xovenmart.android.data.local

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.xovenmart.android.domain.model.CartItem
import com.xovenmart.android.domain.model.CartState
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cart is fully client-side in v1 (the backend has no cart-table).
 * Items are serialized to DataStore so the cart survives process
 * death / cold-start.
 *
 * Dedupe rule: adding the same `productId` increments qty rather than
 * creating a duplicate row.
 */
private val Context.cartDataStore by preferencesDataStore(name = "xm_cart")

interface CartStore {
    val state: Flow<CartState>
    suspend fun snapshot(): CartState
    suspend fun add(item: CartItem)
    suspend fun setQuantity(productId: String, qty: Int)
    suspend fun remove(productId: String)
    suspend fun clear()
}

@Singleton
class CartStoreImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : CartStore {

    private val ds = context.cartDataStore
    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = ListSerializer(CartItemDto.serializer())

    override val state: Flow<CartState> =
        ds.data.map { p -> decode(p[KEY_ITEMS]) }

    override suspend fun snapshot(): CartState = decode(ds.data.first()[KEY_ITEMS])

    override suspend fun add(item: CartItem) {
        ds.edit { p ->
            val current = decode(p[KEY_ITEMS]).items.toMutableList()
            val existing = current.indexOfFirst { it.productId == item.productId }
            if (existing >= 0) {
                val cur = current[existing]
                current[existing] = cur.copy(qty = cur.qty + item.qty)
            } else {
                current.add(item)
            }
            p[KEY_ITEMS] = json.encodeToString(serializer, current.map { it.toDto() })
        }
    }

    override suspend fun setQuantity(productId: String, qty: Int) {
        ds.edit { p ->
            val current = decode(p[KEY_ITEMS]).items.toMutableList()
            val existing = current.indexOfFirst { it.productId == productId }
            if (existing >= 0) {
                if (qty <= 0) current.removeAt(existing)
                else current[existing] = current[existing].copy(qty = qty)
                p[KEY_ITEMS] = json.encodeToString(serializer, current.map { it.toDto() })
            }
        }
    }

    override suspend fun remove(productId: String) = setQuantity(productId, 0)

    override suspend fun clear() {
        ds.edit { it.remove(KEY_ITEMS) }
    }

    private fun decode(raw: String?): CartState {
        if (raw.isNullOrBlank()) return CartState()
        return runCatching { json.decodeFromString(serializer, raw).map { it.toDomain() } }
            .getOrDefault(emptyList())
            .let { CartState(it) }
    }

    @Serializable
    private data class CartItemDto(
        val id: String,
        val productId: String,
        val slug: String,
        val nameBn: String,
        val nameEn: String,
        val unit: String,
        val qty: Int,
        val unitPrice: Double,
        val mrp: Double,
        val image: String? = null,
        val inStock: Boolean = true,
    ) {
        fun toDomain() = CartItem(
            id = id,
            productId = productId,
            slug = slug,
            nameBn = nameBn,
            nameEn = nameEn,
            unit = unit,
            qty = qty,
            unitPrice = unitPrice,
            mrp = mrp,
            image = image,
            inStock = inStock,
        )
    }

    private fun CartItem.toDto() = CartItemDto(
        id = id,
        productId = productId,
        slug = slug,
        nameBn = nameBn,
        nameEn = nameEn,
        unit = unit,
        qty = qty,
        unitPrice = unitPrice,
        mrp = mrp,
        image = image,
        inStock = inStock,
    )

    companion object {
        private val KEY_ITEMS: Preferences.Key<String> = stringPreferencesKey("items_json")
    }
}

@Module
@InstallIn(SingletonComponent::class)
object CartStoreModule {
    @Provides
    @Singleton
    fun provideCartStore(impl: CartStoreImpl): CartStore = impl
}