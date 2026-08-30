package com.xovenmart.android.ui.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import kotlinx.coroutines.flow.StateFlow

/**
 * Tiny extension to make `by collectAsStateValue()` work in screens —
 * avoids the boilerplate `val x by authViewModel.authState.collectAsState()`.
 */
@Composable
fun <T> StateFlow<T>.collectAsStateValue(): State<T> = collectAsState()