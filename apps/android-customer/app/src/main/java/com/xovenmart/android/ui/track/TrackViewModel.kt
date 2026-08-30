package com.xovenmart.android.ui.track

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
class TrackViewModel @Inject constructor(
    private val repo: OrdersRepository,
) : ViewModel() {

    private val _orderNo = MutableStateFlow("")
    val orderNo: StateFlow<String> = _orderNo.asStateFlow()

    private val _phone = MutableStateFlow("")
    val phone: StateFlow<String> = _phone.asStateFlow()

    private val _state = MutableStateFlow<UiState<Order>>(UiState.Empty())
    val state: StateFlow<UiState<Order>> = _state.asStateFlow()

    fun onOrderNoChange(value: String) { _orderNo.value = value }
    fun onPhoneChange(value: String) { _phone.value = value.filter { it.isDigit() }.take(15) }

    fun track() {
        val no = _orderNo.value.trim()
        if (no.isBlank()) {
            _state.value = UiState.Error("Enter an order number.")
            return
        }
        _state.value = UiState.Loading
        viewModelScope.launch {
            repo.track(orderNo = no, phone = _phone.value.trim().ifBlank { null })
                .onSuccess { _state.value = UiState.Success(it) }
                .onFailure { e -> _state.value = UiState.Error(e.message ?: "Could not track order") }
        }
    }

    fun clear() {
        _orderNo.value = ""
        _phone.value = ""
        _state.value = UiState.Empty()
    }
}