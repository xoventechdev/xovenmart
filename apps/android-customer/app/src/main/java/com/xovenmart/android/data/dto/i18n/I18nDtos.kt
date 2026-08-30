package com.xovenmart.android.data.dto.i18n

import kotlinx.serialization.Serializable

@Serializable
data class I18nBundleDto(
    val locale: String,
    val translations: Map<String, String>,
    val count: Int,
)