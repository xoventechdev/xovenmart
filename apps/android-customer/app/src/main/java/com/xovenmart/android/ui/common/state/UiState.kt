package com.xovenmart.android.ui.common.state

/**
 * Generic UI state envelope. Each screen's ViewModel exposes a
 * `StateFlow<UiState<T>>` so the Composable layer has a single shape
 * to render against (loading spinner / data / error / empty list).
 */
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class  Success<T>(val data: T) : UiState<T>
    data class  Empty(val hint: String? = null) : UiState<Nothing>
    data class  Error(val message: String, val cause: Throwable? = null) : UiState<Nothing>
}

inline fun <T, R> UiState<T>.map(transform: (T) -> R): UiState<R> = when (this) {
    is UiState.Loading -> UiState.Loading
    is UiState.Empty   -> UiState.Empty(hint)
    is UiState.Error   -> this
    is UiState.Success -> UiState.Success(transform(data))
}