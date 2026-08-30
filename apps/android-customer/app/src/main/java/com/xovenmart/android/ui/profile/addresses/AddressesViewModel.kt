package com.xovenmart.android.ui.profile.addresses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.repository.CustomerRepository
import com.xovenmart.android.domain.model.Address
import com.xovenmart.android.ui.common.state.UiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AddressesViewModel @Inject constructor(
    private val repo: CustomerRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<UiState<List<Address>>>(UiState.Loading)
    val state: StateFlow<UiState<List<Address>>> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.value = UiState.Loading
        viewModelScope.launch {
            repo.addresses()
                .onSuccess { _state.value = if (it.isEmpty()) UiState.Empty() else UiState.Success(it) }
                .onFailure { e -> _state.value = UiState.Error(e.message ?: "Failed to load addresses") }
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            repo.deleteAddress(id)
                .onSuccess { load() }
                .onFailure { e -> _state.value = UiState.Error(e.message ?: "Delete failed") }
        }
    }
}