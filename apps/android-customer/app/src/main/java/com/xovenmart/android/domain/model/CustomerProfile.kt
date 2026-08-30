package com.xovenmart.android.domain.model

/**
 * Snapshot of the authenticated customer. Lives in
 * [com.xovenmart.android.data.repository.AuthRepository] and is
 * observed by the profile screen.
 */
data class CustomerProfile(
    val id: String,
    val phone: String,
    val name: String,
    val email: String? = null,
    val referralCode: String,
    val referredById: String? = null,
)