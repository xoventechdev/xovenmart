package com.xovenmart.android.ui.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.repository.OrdersRepository
import com.xovenmart.android.domain.model.Order
import com.xovenmart.android.ui.common.state.UiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OrdersListViewModel @Inject constructor(
    private val repo: OrdersRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<UiState<List<Order>>>(UiState.Loading)
    val state: StateFlow<UiState<List<Order>>> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = UiState.Loading
        viewModelScope.launch {
            repo.mine()
                .onSuccess { list -> _state.value = if (list.isEmpty()) UiState.Empty() else UiState.Success(list) }
                .onFailure { e -> _state.value = UiState.Error(e.message ?: "Failed to load orders") }
        }
    }
}