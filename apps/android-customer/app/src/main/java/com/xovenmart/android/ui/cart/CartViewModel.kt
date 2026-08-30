package com.xovenmart.android.ui.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.local.CartStore
import com.xovenmart.android.domain.model.CartItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CartViewModel @Inject constructor(
    private val cartStore: CartStore,
) : ViewModel() {

    val items: StateFlow<List<CartItem>> = cartStore.state
        .map { it.items }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val subtotal: StateFlow<Double> = cartStore.state
        .map { it.subtotal }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0.0)

    val mrpTotal: StateFlow<Double> = cartStore.state
        .map { it.mrpTotal }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0.0)

    val totalItems: StateFlow<Int> = cartStore.state
        .map { it.totalItems }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    fun increment(item: CartItem) {
        viewModelScope.launch {
            cartStore.setQuantity(item.productId, item.qty + 1)
        }
    }

    fun decrement(item: CartItem) {
        viewModelScope.launch {
            cartStore.setQuantity(item.productId, item.qty - 1)
        }
    }

    fun remove(item: CartItem) {
        viewModelScope.launch {
            cartStore.remove(item.productId)
        }
    }

    fun clear() {
        viewModelScope.launch { cartStore.clear() }
    }
}