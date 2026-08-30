package com.xovenmart.android.data.local

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lightweight per-device preferences that aren't sensitive enough to
 * warrant encryption: UI locale + onboarding flag + last-used search
 * queries. Backed by DataStore Preferences.
 */
private val Context.sessionDataStore by preferencesDataStore(name = "xm_session")

interface SessionStore {
    val locale: Flow<String>          // "en" | "bn"
    val onboarded: Flow<Boolean>
    suspend fun setLocale(locale: String)
    suspend fun setOnboarded(value: Boolean)
}

@Singleton
class SessionStoreImpl @Inject constructor(
    @ApplicationContext private val context: Context,
) : SessionStore {

    private val ds = context.sessionDataStore

    override val locale: Flow<String> =
        ds.data.map { it[KEY_LOCALE] ?: "en" }

    override val onboarded: Flow<Boolean> =
        ds.data.map { it[KEY_ONBOARDED] ?: false }

    override suspend fun setLocale(locale: String) {
        ds.edit { it[KEY_LOCALE] = locale }
    }

    override suspend fun setOnboarded(value: Boolean) {
        ds.edit { it[KEY_ONBOARDED] = value }
    }

    companion object {
        private val KEY_LOCALE: Preferences.Key<String>  = stringPreferencesKey("locale")
        private val KEY_ONBOARDED: Preferences.Key<Boolean> = booleanPreferencesKey("onboarded")
    }
}

@Module
@InstallIn(SingletonComponent::class)
object SessionStoreModule {
    @Provides
    @Singleton
    fun provideSessionStore(impl: SessionStoreImpl): SessionStore = impl
}