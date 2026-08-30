package com.xovenmart.android.domain.model

/** A saved delivery address (account-scoped). */
data class Address(
    val id: String,
    val userId: String,
    val label: String?,
    val area: String,
    val landmark: String?,
    val fullText: String,
    val lat: Double?,
    val lng: Double?,
    val isDefault: Boolean,
)