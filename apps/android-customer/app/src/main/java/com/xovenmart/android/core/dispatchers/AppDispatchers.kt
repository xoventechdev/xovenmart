package com.xovenmart.android.core.dispatchers

import kotlinx.coroutines.CoroutineDispatcher

/**
 * Lightweight abstraction over [kotlinx.coroutines.Dispatchers] so unit
 * tests can swap in a `TestDispatcher`. Three roles:
 *
 *  - `io`: blocking work — Retrofit calls, DataStore reads, file IO.
 *  - `default`: CPU-bound work — JSON parsing, mappers.
 *  - `main`: anything that touches Compose state.
 */
data class AppDispatchers(
    val io: CoroutineDispatcher,
    val default: CoroutineDispatcher,
    val main: CoroutineDispatcher,
)