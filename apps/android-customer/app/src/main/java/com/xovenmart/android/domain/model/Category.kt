package com.xovenmart.android.domain.model

data class Category(
    val id: String,
    val slug: String,
    val nameBn: String,
    val nameEn: String,
    val imageUrl: String?,
    val productCount: Int = 0,
    val children: List<Category> = emptyList(),
)