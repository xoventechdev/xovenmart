package com.xovenmart.android.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Storage bindings live here. The actual [androidx.security.crypto.EncryptedSharedPreferences]
 * wiring ships in #81 (Network layer + secure token store); the rest of
 * the app already consumes [com.xovenmart.android.data.network.SecureTokenStore]
 * via Hilt so the swap is invisible downstream.
 */
@Module
@InstallIn(SingletonComponent::class)
object StorageModule