package com.xovenmart.android.data.api

import com.xovenmart.android.data.dto.i18n.I18nBundleDto
import retrofit2.http.GET
import retrofit2.http.Path

interface I18nApi {

    @GET("i18n/{locale}")
    suspend fun bundle(@Path("locale") locale: String): I18nBundleDto
}