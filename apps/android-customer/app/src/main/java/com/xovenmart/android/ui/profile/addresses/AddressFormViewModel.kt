package com.xovenmart.android.ui.profile.addresses

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.repository.CustomerRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AddressFormViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repo: CustomerRepository,
) : ViewModel() {

    val addressId: String? = savedStateHandle.get<String>("id")?.takeIf { it.isNotBlank() }
    val isEditing: Boolean get() = addressId != null

    private val _label = MutableStateFlow("Home")
    val label: StateFlow<String> = _label.asStateFlow()

    private val _area = MutableStateFlow("")
    val area: StateFlow<String> = _area.asStateFlow()

    private val _landmark = MutableStateFlow("")
    val landmark: StateFlow<String> = _landmark.asStateFlow()

    private val _fullText = MutableStateFlow("")
    val fullText: StateFlow<String> = _fullText.asStateFlow()

    private val _isDefault = MutableStateFlow(false)
    val isDefault: StateFlow<Boolean> = _isDefault.asStateFlow()

    private val _submitting = MutableStateFlow(false)
    val submitting: StateFlow<Boolean> = _submitting.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _saved = MutableStateFlow(false)
    val saved: StateFlow<Boolean> = _saved.asStateFlow()

    init {
        if (isEditing) {
            viewModelScope.launch {
                repo.addresses()
                    .onSuccess { list ->
                        val target = list.firstOrNull { it.id == addressId } ?: return@onSuccess
                        _label.value = target.label ?: "Home"
                        _area.value = target.area
                        _landmark.value = target.landmark.orEmpty()
                        _fullText.value = target.fullText
                        _isDefault.value = target.isDefault
                    }
            }
        }
    }

    fun onLabelChange(v: String) { _label.value = v }
    fun onAreaChange(v: String) { _area.value = v }
    fun onLandmarkChange(v: String) { _landmark.value = v }
    fun onFullTextChange(v: String) { _fullText.value = v }
    fun onDefaultChange(v: Boolean) { _isDefault.value = v }
    fun clearError() { _error.value = null }

    fun save() {
        if (_area.value.isBlank() || _fullText.value.isBlank()) {
            _error.value = "Area and full address are required."
            return
        }
        _submitting.value = true
        _error.value = null
        viewModelScope.launch {
            val label: String? = _label.value.trim().ifBlank { null }
            val landmark: String? = _landmark.value.trim().ifBlank { null }
            val result = if (isEditing) {
                repo.updateAddress(
                    id = addressId!!,
                    label = label,
                    area = _area.value.trim(),
                    landmark = landmark,
                    fullText = _fullText.value.trim(),
                    isDefault = _isDefault.value,
                )
            } else {
                repo.createAddress(
                    label = label,
                    area = _area.value.trim(),
                    landmark = landmark,
                    fullText = _fullText.value.trim(),
                    lat = null,
                    lng = null,
                    isDefault = _isDefault.value,
                )
            }
            result.onSuccess { _saved.value = true; _submitting.value = false }
                .onFailure { e -> _submitting.value = false; _error.value = e.message }
        }
    }
}