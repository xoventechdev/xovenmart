package com.xovenmart.android.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * XovenMart brand palette. Mirrors `apps/web/components/ui/brand.tsx`
 * — keep these in sync when the marketing team adjusts brand colors.
 */
object XovenMartColors {
    // Brand teals (primary)
    val PrimaryTeal        = Color(0xFF0F766E)
    val PrimaryTealDark    = Color(0xFF0B5C56)
    val PrimaryTealLight   = Color(0xFFCCFBF1)

    // Warm "ink" neutrals
    val Ink50              = Color(0xFFFAF7F2) // off-white background
    val Ink100             = Color(0xFFF1ECE3)
    val Ink300             = Color(0xFFCBC3B5)
    val Ink500             = Color(0xFF8A8273)
    val Ink700             = Color(0xFF4A4538)
    val Ink900             = Color(0xFF1F1B16) // main text

    // Accent — used sparingly for "deal" / "active" highlights
    val AccentAmber        = Color(0xFFD97706)
    val AccentAmberSoft    = Color(0xFFFEF3C7)

    // Functional
    val Success            = Color(0xFF15803D)
    val SuccessSoft        = Color(0xFFDCFCE7)
    val Error              = Color(0xFFB91C1C)
    val ErrorSoft          = Color(0xFFFEE2E2)
    val Info               = Color(0xFF1D4ED8)
    val InfoSoft           = Color(0xFFDBEAFE)

    // Surfaces
    val SurfaceWhite       = Color(0xFFFFFFFF)
    val SurfaceMuted       = Color(0xFFF7F4ED)
}