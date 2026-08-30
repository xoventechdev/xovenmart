package com.xovenmart.android.domain.model

/**
 * Auth state envelope observed by the nav graph.
 * Concrete user data lives in [CustomerProfile].
 */
sealed interface AuthState {
    data object Unknown       : AuthState
    data object Anonymous     : AuthState
    data object Authenticated : AuthState
}