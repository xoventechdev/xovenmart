package com.xovenmart.android.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.network.SecureTokenStore
import com.xovenmart.android.data.repository.AuthRepository
import com.xovenmart.android.data.repository.CustomerRepository
import com.xovenmart.android.data.repository.ReferralsRepository
import com.xovenmart.android.domain.model.CustomerProfile
import com.xovenmart.android.domain.model.ReferralOverview
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepo: AuthRepository,
    private val customerRepo: CustomerRepository,
    private val referralsRepo: ReferralsRepository,
    private val tokens: SecureTokenStore,
) : ViewModel() {

    private val _profile = MutableStateFlow<CustomerProfile?>(null)
    val profile: StateFlow<CustomerProfile?> = _profile.asStateFlow()

    private val _referral = MutableStateFlow<ReferralOverview?>(null)
    val referral: StateFlow<ReferralOverview?> = _referral.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /**
     * Mirror of the auth flag — we don't depend on AuthViewModel because Hilt
     * disallows @HiltViewModel-into-@HiltViewModel injection. Both VMs read
     * the same SecureTokenStore singleton so the values stay in sync.
     */
    private val _isSignedIn = MutableStateFlow(tokens.access() != null)
    val isSignedIn: StateFlow<Boolean> = _isSignedIn.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            customerRepo.profile()
                .onSuccess { _profile.value = it }
                .onFailure { e -> _error.value = e.message }
        }
        viewModelScope.launch {
            referralsRepo.overview()
                .onSuccess { _referral.value = it }
                .onFailure { /* non-fatal */ }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            authRepo.logout()
            _isSignedIn.value = false
        }
    }

    fun clearError() { _error.value = null }
}