package com.xovenmart.android.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.local.CartStore
import com.xovenmart.android.data.repository.CatalogRepository
import com.xovenmart.android.domain.model.CartItem
import com.xovenmart.android.domain.model.Category
import com.xovenmart.android.domain.model.ProductSummary
import com.xovenmart.android.ui.common.state.UiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val catalog: CatalogRepository,
    private val cartStore: CartStore,
) : ViewModel() {

    private val _featured = MutableStateFlow<UiState<List<ProductSummary>>>(UiState.Loading)
    val featured: StateFlow<UiState<List<ProductSummary>>> = _featured.asStateFlow()

    private val _categories = MutableStateFlow<UiState<List<Category>>>(UiState.Loading)
    val categories: StateFlow<UiState<List<Category>>> = _categories.asStateFlow()

    val cartCount: StateFlow<Int> = cartStore.state
        .map { it.totalItems }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _featured.value = UiState.Loading
            _categories.value = UiState.Loading
            catalog.featured()
                .onSuccess { _featured.value = UiState.Success(it) }
                .onFailure { _featured.value = UiState.Error(it.message ?: "Failed to load") }
            catalog.categories()
                .onSuccess { _categories.value = UiState.Success(it) }
                .onFailure { _categories.value = UiState.Error(it.message ?: "Failed to load") }
        }
    }

    fun addToCart(product: ProductSummary) {
        viewModelScope.launch {
            cartStore.add(
                CartItem(
                    productId = product.id,
                    slug = product.slug,
                    nameBn = product.nameBn,
                    nameEn = product.nameEn,
                    unit = product.unit,
                    qty = 1,
                    unitPrice = product.salePrice,
                    mrp = product.mrp,
                    image = product.image,
                    inStock = product.inStock,
                )
            )
        }
    }
}