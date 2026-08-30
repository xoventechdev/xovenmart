package com.xovenmart.android.ui.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xovenmart.android.data.local.CartStore
import com.xovenmart.android.data.network.SecureTokenStore
import com.xovenmart.android.data.repository.AuthRepository
import com.xovenmart.android.data.repository.CheckoutRepository
import com.xovenmart.android.data.repository.CustomerRepository
import com.xovenmart.android.domain.model.Address
import com.xovenmart.android.domain.model.AddressSnapshot
import com.xovenmart.android.domain.model.CartPriceQuote
import com.xovenmart.android.domain.model.CartState
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
class CheckoutViewModel @Inject constructor(
    private val cartStore: CartStore,
    private val checkoutRepo: CheckoutRepository,
    private val customerRepo: CustomerRepository,
    private val authRepo: AuthRepository,
    private val tokens: SecureTokenStore,
) : ViewModel() {

    /** True if the user has an access token — drives the auth gate at submit time. */
    val isAuthenticated: StateFlow<Boolean> = MutableStateFlow(tokens.access() != null)
        .asStateFlow()

    val cart: StateFlow<CartState> = cartStore.state
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CartState())

    private val _addresses = MutableStateFlow<List<Address>>(emptyList())
    val addresses: StateFlow<List<Address>> = _addresses.asStateFlow()

    private val _selectedAddressId = MutableStateFlow<String?>(null)
    val selectedAddressId: StateFlow<String?> = _selectedAddressId.asStateFlow()

    /** Quote refreshed from the backend when cart or coupon changes. */
    private val _quote = MutableStateFlow<CartPriceQuote?>(null)
    val quote: StateFlow<CartPriceQuote?> = _quote.asStateFlow()

    private val _coupon = MutableStateFlow<String?>(null)
    val coupon: StateFlow<String?> = _coupon.asStateFlow()

    private val _notes = MutableStateFlow("")
    val notes: StateFlow<String> = _notes.asStateFlow()

    /** Guest name + phone captured when not authenticated. */
    private val _guestName = MutableStateFlow("")
    val guestName: StateFlow<String> = _guestName.asStateFlow()
    private val _guestPhone = MutableStateFlow("")
    val guestPhone: StateFlow<String> = _guestPhone.asStateFlow()

    /** Free-text address — used as the snapshot when no saved address is picked. */
    private val _addressText = MutableStateFlow("")
    val addressText: StateFlow<String> = _addressText.asStateFlow()
    private val _area = MutableStateFlow("")
    val area: StateFlow<String> = _area.asStateFlow()
    private val _landmark = MutableStateFlow("")
    val landmark: StateFlow<String> = _landmark.asStateFlow()
    private val _addressLat = MutableStateFlow<Double?>(null)
    val addressLat: StateFlow<Double?> = _addressLat.asStateFlow()
    private val _addressLng = MutableStateFlow<Double?>(null)
    val addressLng: StateFlow<Double?> = _addressLng.asStateFlow()

    private val _submitting = MutableStateFlow(false)
    val submitting: StateFlow<Boolean> = _submitting.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _placedOrderNo = MutableStateFlow<String?>(null)
    val placedOrderNo: StateFlow<String?> = _placedOrderNo.asStateFlow()

    init {
        loadAddresses()
        refreshQuote()
        viewModelScope.launch {
            cartStore.state.collect { refreshQuote() }
        }
    }

    private fun loadAddresses() {
        if (tokens.access() == null) return
        viewModelScope.launch {
            customerRepo.addresses()
                .onSuccess { list ->
                    _addresses.value = list
                    val def = list.firstOrNull { it.isDefault } ?: list.firstOrNull()
                    _selectedAddressId.value = def?.id
                    if (def != null) {
                        _addressText.value = def.fullText
                        _area.value = def.area
                        _landmark.value = def.landmark.orEmpty()
                        _addressLat.value = def.lat
                        _addressLng.value = def.lng
                    }
                }
        }
    }

    fun selectAddress(id: String) {
        _selectedAddressId.value = id
        val a = _addresses.value.firstOrNull { it.id == id } ?: return
        _addressText.value = a.fullText
        _area.value = a.area
        _landmark.value = a.landmark.orEmpty()
        _addressLat.value = a.lat
        _addressLng.value = a.lng
    }

    fun onCouponChange(value: String) { _coupon.value = value.trim().ifBlank { null } }
    fun onNotesChange(value: String) { _notes.value = value }
    fun onGuestNameChange(value: String) { _guestName.value = value }
    fun onGuestPhoneChange(value: String) { _guestPhone.value = value }
    fun onAddressTextChange(value: String) { _addressText.value = value }
    fun onAreaChange(value: String) { _area.value = value }
    fun onLandmarkChange(value: String) { _landmark.value = value }

    fun retryQuote() = refreshQuote()

    private fun refreshQuote() {
        viewModelScope.launch {
            val items = cartStore.snapshot().items
            if (items.isEmpty()) {
                _quote.value = null
                return@launch
            }
            checkoutRepo.price(
                items = items.map { it.productId to it.qty },
                couponCode = _coupon.value,
            ).onSuccess { _quote.value = it }
                .onFailure { _error.value = it.message }
        }
    }

    fun applyCoupon() = refreshQuote()

    fun clearError() { _error.value = null }

    /**
     * Validate, then POST /checkout. On success, clear the cart and emit the
     * order number via [placedOrderNo] so the screen can navigate.
     */
    fun placeOrder() {
        val q = _quote.value
        val items = cart.value.items
        if (items.isEmpty()) {
            _error.value = "Your cart is empty."
            return
        }
        if (_addressText.value.isBlank() || _area.value.isBlank()) {
            _error.value = "Please enter a delivery address."
            return
        }
        if (_addressLat.value == null || _addressLng.value == null) {
            _error.value = "We need your location coordinates to check delivery. Please set the address on a map or use the location pin."
            return
        }
        if (tokens.access() == null) {
            if (_guestName.value.isBlank() || _guestPhone.value.length < 11) {
                _error.value = "Please enter your name and phone number."
                return
            }
        }
        val qty = q?.errors.orEmpty()
        if (qty.isNotEmpty()) {
            _error.value = qty.joinToString("\n")
            return
        }

        _submitting.value = true
        _error.value = null
        viewModelScope.launch {
            val snap = AddressSnapshot(
                label = _addresses.value.firstOrNull { it.id == _selectedAddressId.value }?.label,
                area = _area.value.trim(),
                landmark = _landmark.value.trim().ifBlank { null },
                fullText = _addressText.value.trim(),
                lat = _addressLat.value ?: 0.0,
                lng = _addressLng.value ?: 0.0,
            )
            checkoutRepo.place(
                items = items.map { it.productId to it.qty },
                address = snap,
                couponCode = _coupon.value,
                notes = _notes.value.trim().ifBlank { null },
                guestName = if (tokens.access() == null) _guestName.value.trim() else null,
                guestPhone = if (tokens.access() == null) _guestPhone.value.trim() else null,
            ).onSuccess { order ->
                cartStore.clear()
                _placedOrderNo.value = order.orderNo
                _submitting.value = false
            }.onFailure { e ->
                _submitting.value = false
                _error.value = e.message ?: "Could not place order."
            }
        }
    }

    /** Currently effective address snapshot (used by the screen for display). */
    fun currentAddressSnapshot(): AddressSnapshot? {
        if (_addressText.value.isBlank() || _area.value.isBlank()) return null
        return AddressSnapshot(
            label = _addresses.value.firstOrNull { it.id == _selectedAddressId.value }?.label,
            area = _area.value.trim(),
            landmark = _landmark.value.trim().ifBlank { null },
            fullText = _addressText.value.trim(),
            lat = _addressLat.value ?: 0.0,
            lng = _addressLng.value ?: 0.0,
        )
    }
}