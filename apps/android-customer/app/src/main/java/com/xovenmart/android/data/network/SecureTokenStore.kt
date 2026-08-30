package com.xovenmart.android.data.network

/**
 * Persistent, encrypted token store. Backed in production by
 * [androidx.security.crypto.EncryptedSharedPreferences] (AES-256-GCM);
 * see [com.xovenmart.android.data.local.SecureTokenStoreImpl] for the
 * implementation.
 *
 * Audience is locked to `customer` for this app — the rider / admin
 * apps will get their own stores.
 */
interface SecureTokenStore {
    fun access(): String?
    fun refresh(): String?
    fun audience(): String
    fun save(access: String, refresh: String)
    fun clear()
}