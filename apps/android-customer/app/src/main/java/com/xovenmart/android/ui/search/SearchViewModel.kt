package com.xovenmart.android.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.local.CartStore
import com.xovenmart.android.data.repository.CatalogRepository
import com.xovenmart.android.domain.model.CartItem
import com.xovenmart.android.domain.model.ProductSearchHit
import com.xovenmart.android.ui.common.state.UiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@OptIn(FlowPreview::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val catalog: CatalogRepository,
    private val cartStore: CartStore,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _hits = MutableStateFlow<UiState<List<ProductSearchHit>>>(UiState.Empty())
    val hits: StateFlow<UiState<List<ProductSearchHit>>> = _hits.asStateFlow()

    val cartCount: StateFlow<Int> = cartStore.state
        .map { it.totalItems }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            _query
                .debounce(300L)
                .collectLatest { q ->
                    val trimmed = q.trim()
                    if (trimmed.length < 2) {
                        _hits.value = UiState.Empty()
                        return@collectLatest
                    }
                    _hits.value = UiState.Loading
                    catalog.search(trimmed)
                        .onSuccess { results ->
                            _hits.value = if (results.isEmpty()) UiState.Empty()
                            else UiState.Success(results)
                        }
                        .onFailure { e ->
                            _hits.value = UiState.Error(e.message ?: "Search failed")
                        }
                }
        }
    }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun clearQuery() {
        _query.value = ""
    }

    fun retry() {
        // Force a re-emit by re-collecting — easier: re-run the call.
        searchJob?.cancel()
        val trimmed = _query.value.trim()
        if (trimmed.length < 2) {
            _hits.value = UiState.Empty()
            return
        }
        searchJob = viewModelScope.launch {
            _hits.value = UiState.Loading
            catalog.search(trimmed)
                .onSuccess { results ->
                    _hits.value = if (results.isEmpty()) UiState.Empty()
                    else UiState.Success(results)
                }
                .onFailure { e ->
                    _hits.value = UiState.Error(e.message ?: "Search failed")
                }
        }
    }

    /**
     * Convert a hit into a ProductSummary-like add-to-cart payload.
     * Search hits don't carry every field (no stock flag, no discount pct),
     * so we conservatively assume in-stock = true and discount = 0.
     */
    fun addHitToCart(hit: ProductSearchHit) {
        viewModelScope.launch {
            cartStore.add(
                CartItem(
                    productId = hit.id,
                    slug = hit.slug,
                    nameBn = hit.nameBn,
                    nameEn = hit.nameEn,
                    unit = "",
                    qty = 1,
                    unitPrice = hit.price,
                    mrp = hit.mrp,
                    image = hit.image,
                    inStock = true,
                ),
            )
        }
    }
}