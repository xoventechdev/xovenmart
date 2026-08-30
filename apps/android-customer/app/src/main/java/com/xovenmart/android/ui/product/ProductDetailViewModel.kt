package com.xovenmart.android.ui.product

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.local.CartStore
import com.xovenmart.android.data.repository.CatalogRepository
import com.xovenmart.android.domain.model.CartItem
import com.xovenmart.android.domain.model.ProductDetail
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
class ProductDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val catalog: CatalogRepository,
    private val cartStore: CartStore,
) : ViewModel() {

    val slug: String = savedStateHandle.get<String>("slug").orEmpty()

    private val _state = MutableStateFlow<UiState<ProductDetail>>(UiState.Loading)
    val state: StateFlow<UiState<ProductDetail>> = _state.asStateFlow()

    private val _qty = MutableStateFlow(1)
    val qty: StateFlow<Int> = _qty.asStateFlow()

    val cartCount: StateFlow<Int> = cartStore.state
        .map { it.totalItems }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            catalog.product(slug)
                .onSuccess { _state.value = UiState.Success(it) }
                .onFailure { _state.value = UiState.Error(it.message ?: "Failed") }
        }
    }

    fun increment() { _qty.value = _qty.value + 1 }
    fun decrement() { _qty.value = (_qty.value - 1).coerceAtLeast(1) }

    fun addToCart(onAdded: () -> Unit) {
        val product = (_state.value as? UiState.Success<ProductDetail>)?.data ?: return
        viewModelScope.launch {
            cartStore.add(
                CartItem(
                    productId = product.summary.id,
                    slug = product.summary.slug,
                    nameBn = product.summary.nameBn,
                    nameEn = product.summary.nameEn,
                    unit = product.summary.unit,
                    qty = _qty.value,
                    unitPrice = product.summary.salePrice,
                    mrp = product.summary.mrp,
                    image = product.summary.image,
                    inStock = product.summary.inStock,
                )
            )
            onAdded()
        }
    }
}