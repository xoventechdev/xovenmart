package com.xovenmart.android.ui.category

import androidx.lifecycle.SavedStateHandle
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
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CategoryViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val catalog: CatalogRepository,
    private val cartStore: CartStore,
) : ViewModel() {

    val slug: String = savedStateHandle.get<String>("slug").orEmpty()

    private val _category = MutableStateFlow<UiState<Category>>(UiState.Loading)
    val category: StateFlow<UiState<Category>> = _category.asStateFlow()

    private val _products = MutableStateFlow<UiState<List<ProductSummary>>>(UiState.Loading)
    val products: StateFlow<UiState<List<ProductSummary>>> = _products.asStateFlow()

    val cartCount: StateFlow<Int> = cartStore.state
        .map { it.totalItems }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    init { load() }

    fun load() {
        viewModelScope.launch {
            _category.value = UiState.Loading
            _products.value = UiState.Loading
            catalog.category(slug)
                .onSuccess { _category.value = UiState.Success(it) }
                .onFailure { _category.value = UiState.Error(it.message ?: "Failed") }
            catalog.products(categorySlug = slug)
                .onSuccess { _products.value = UiState.Success(it) }
                .onFailure { _products.value = UiState.Error(it.message ?: "Failed") }
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