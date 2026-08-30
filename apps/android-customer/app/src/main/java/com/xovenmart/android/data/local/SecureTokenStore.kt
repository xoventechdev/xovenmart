package com.xovenmart.android.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.xovenmart.android.data.network.SecureTokenStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AES-256-GCM encrypted [SharedPreferences] holding the customer's
 * access + refresh tokens. The audience is locked to `customer` for
 * this app.
 *
 * Storage file: `xovenmart_secure_prefs.xml` (also excluded from
 * backup_rules.xml + data_extraction_rules.xml so it never leaves the
 * device via cloud backup / device transfer).
 */
@Singleton
class SecureTokenStoreImpl @Inject constructor(
    @ApplicationContext context: Context,
) : SecureTokenStore {

    private val prefs: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun access(): String? = prefs.getString(KEY_ACCESS, null)
    override fun refresh(): String? = prefs.getString(KEY_REFRESH, null)
    override fun audience(): String = prefs.getString(KEY_AUDIENCE, null) ?: AUDIENCE

    override fun save(access: String, refresh: String) {
        prefs.edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .putString(KEY_AUDIENCE, AUDIENCE)
            .apply()
    }

    override fun clear() {
        prefs.edit()
            .remove(KEY_ACCESS)
            .remove(KEY_REFRESH)
            .remove(KEY_AUDIENCE)
            .apply()
    }

    companion object {
        const val FILE_NAME = "xovenmart_secure_prefs"
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_AUDIENCE = "audience"
        private const val AUDIENCE = "customer"
    }
}

@Module
@InstallIn(SingletonComponent::class)
object SecureTokenStoreModule {
    @Provides
    @Singleton
    fun provideSecureTokenStore(impl: SecureTokenStoreImpl): SecureTokenStore = impl
}