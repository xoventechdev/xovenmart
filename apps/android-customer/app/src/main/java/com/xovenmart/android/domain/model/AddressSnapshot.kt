package com.xovenmart.android.domain.model

/**
 * Address captured at order time (no `id` / `userId` / `isDefault`).
 * Mirrors what the backend stores on the order row.
 */
data class AddressSnapshot(
    val label: String?,
    val area: String,
    val landmark: String?,
    val fullText: String,
    val lat: Double,
    val lng: Double,
)