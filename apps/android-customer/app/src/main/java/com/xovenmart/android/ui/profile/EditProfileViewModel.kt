package com.xovenmart.android.ui.profile

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
class EditProfileViewModel @Inject constructor(
    private val customerRepo: CustomerRepository,
) : ViewModel() {

    private val _name = MutableStateFlow("")
    val name: StateFlow<String> = _name.asStateFlow()

    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _submitting = MutableStateFlow(false)
    val submitting: StateFlow<Boolean> = _submitting.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _saved = MutableStateFlow(false)
    val saved: StateFlow<Boolean> = _saved.asStateFlow()

    init {
        viewModelScope.launch {
            customerRepo.profile()
                .onSuccess { p ->
                    _name.value = p.name
                    _email.value = p.email.orEmpty()
                }
                .onFailure { e -> _error.value = e.message }
        }
    }

    fun onNameChange(value: String) { _name.value = value }
    fun onEmailChange(value: String) { _email.value = value }
    fun clearError() { _error.value = null }

    fun save() {
        val n = _name.value.trim()
        if (n.length < 2) {
            _error.value = "Name is required."
            return
        }
        _submitting.value = true
        _error.value = null
        viewModelScope.launch {
            customerRepo.updateProfile(name = n, email = _email.value.trim().ifBlank { null })
                .onSuccess { _saved.value = true; _submitting.value = false }
                .onFailure { e -> _submitting.value = false; _error.value = e.message }
        }
    }
}