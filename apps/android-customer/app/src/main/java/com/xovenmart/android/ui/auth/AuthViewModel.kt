package com.xovenmart.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.network.SecureTokenStore
import com.xovenmart.android.data.repository.AuthRepository
import com.xovenmart.android.domain.model.AuthState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Single auth VM shared by Login / Register / Forgot / Otp screens.
 * Holds the in-progress phone for the OTP continuation, plus a small
 * [AuthUiState] envelope the screens render against.
 *
 * Bootstrap state is derived from [SecureTokenStore] — if we already
 * have an access token, the user lands on Home; otherwise Login.
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repo: AuthRepository,
    private val tokens: SecureTokenStore,
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(
        if (tokens.access() != null) AuthState.Authenticated else AuthState.Anonymous
    )
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _ui = MutableStateFlow(AuthUiState())
    val ui: StateFlow<AuthUiState> = _ui.asStateFlow()

    /**
     * Phone that the OTP screen should verify. Carried across screens
     * via this VM instead of nav args so back-stack survives rotation.
     */
    private val _pendingPhone = MutableStateFlow<String?>(null)
    val pendingPhone: StateFlow<String?> = _pendingPhone.asStateFlow()

    fun login(phone: String, password: String) {
        _ui.value = _ui.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            repo.login(phone.trim(), password)
                .onSuccess { markAuthenticated() }
                .onFailure { e -> _ui.value = _ui.value.copy(submitting = false, error = e.message) }
        }
    }

    fun register(
        phone: String,
        name: String,
        password: String,
        email: String?,
        otpCode: String?,
        referralCode: String?,
    ) {
        _ui.value = _ui.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            repo.register(phone.trim(), name.trim(), password, email?.trim(), otpCode, referralCode?.trim())
                .onSuccess { markAuthenticated() }
                .onFailure { e -> _ui.value = _ui.value.copy(submitting = false, error = e.message) }
        }
    }

    fun requestOtp(phone: String) {
        _ui.value = _ui.value.copy(submitting = true, error = null, devCode = null)
        viewModelScope.launch {
            repo.requestOtp(phone.trim())
                .onSuccess { resp ->
                    _pendingPhone.value = phone.trim()
                    val devCode = (resp as? com.xovenmart.android.data.dto.auth.OtpIssuedResponse)?.devCode
                    _ui.value = _ui.value.copy(submitting = false, devCode = devCode)
                }
                .onFailure { e -> _ui.value = _ui.value.copy(submitting = false, error = e.message) }
        }
    }

    fun verifyOtp(code: String) {
        val phone = _pendingPhone.value ?: return
        _ui.value = _ui.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            repo.verifyOtp(phone, code)
                .onSuccess { resp ->
                    _ui.value = _ui.value.copy(submitting = false)
                    when {
                        resp.user != null && resp.accessToken != null -> {
                            // Got tokens — store and finish.
                            tokens.save(resp.accessToken, resp.refreshToken ?: "")
                            markAuthenticated()
                        }
                        resp.registrationRequired -> _ui.value = _ui.value.copy(navigateToRegister = true)
                        resp.firstTimeSetupRequired -> _ui.value = _ui.value.copy(navigateToSetPassword = true)
                    }
                }
                .onFailure { e -> _ui.value = _ui.value.copy(submitting = false, error = e.message) }
        }
    }

    fun forgotPassword(phone: String) {
        _ui.value = _ui.value.copy(submitting = true, error = null, devCode = null)
        viewModelScope.launch {
            repo.forgotPassword(phone.trim())
                .onSuccess { resp ->
                    _pendingPhone.value = phone.trim()
                    val devCode = (resp as? com.xovenmart.android.data.dto.auth.OtpIssuedResponse)?.devCode
                    _ui.value = _ui.value.copy(submitting = false, devCode = devCode, navigateToReset = true)
                }
                .onFailure { e -> _ui.value = _ui.value.copy(submitting = false, error = e.message) }
        }
    }

    fun resetPassword(otpCode: String, newPassword: String) {
        val phone = _pendingPhone.value ?: return
        _ui.value = _ui.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            repo.resetPassword(phone, otpCode, newPassword)
                .onSuccess { markAuthenticated() }
                .onFailure { e -> _ui.value = _ui.value.copy(submitting = false, error = e.message) }
        }
    }

    fun setPendingPhone(phone: String) { _pendingPhone.value = phone.trim() }

    fun clearError() { _ui.value = _ui.value.copy(error = null) }
    fun consumeNavigation() {
        _ui.value = _ui.value.copy(navigateToRegister = false, navigateToSetPassword = false, navigateToReset = false)
    }

    fun signOut() {
        viewModelScope.launch {
            repo.logout()
            tokens.clear()
            _authState.value = AuthState.Anonymous
        }
    }

    private fun markAuthenticated() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(submitting = false, error = null)
            _authState.value = AuthState.Authenticated
        }
    }
}

/** UI state envelope for the auth screens. */
data class AuthUiState(
    val submitting: Boolean = false,
    val error: String? = null,
    val devCode: String? = null,
    val navigateToRegister: Boolean = false,
    val navigateToSetPassword: Boolean = false,
    val navigateToReset: Boolean = false,
)