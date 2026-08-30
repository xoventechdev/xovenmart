package com.xovenmart.android.data.repository

import com.xovenmart.android.data.api.I18nApi
import com.xovenmart.android.data.network.toAppError
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class I18nRepository @Inject constructor(
    private val api: I18nApi,
) {
    suspend fun bundle(locale: String): Result<Map<String, String>> = runCatching {
        api.bundle(locale).translations
    }.toAppResult()
}

private inline fun <T> Result<T>.toAppResult(): Result<T> =
    recoverCatching { throw it.toAppError() }