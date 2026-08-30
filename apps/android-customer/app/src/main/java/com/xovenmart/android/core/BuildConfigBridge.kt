package com.xovenmart.android.core

import com.xovenmart.android.BuildConfig

/**
 * Thin wrapper around [BuildConfig] so non-Android code (tests, the DI
 * graph, etc.) doesn't have to import the generated class directly.
 *
 * Use [apiBaseUrl] / [apiEnv] / [allowCleartext] instead of touching
 * `BuildConfig.API_BASE_URL` etc. from feature modules — that way a
 * future move to flavor-specific builds only has to touch one file.
 */
object BuildConfigBridge {
    val apiBaseUrl: String = BuildConfig.API_BASE_URL
    val apiEnv: String = BuildConfig.API_ENV
    val isDebug: Boolean = BuildConfig.DEBUG
    val allowCleartext: Boolean = BuildConfig.ALLOW_CLEARTEXT
}