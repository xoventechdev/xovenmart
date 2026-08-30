package com.xovenmart.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

/**
 * Single source of truth for Material 3 colors in the XovenMart
 * customer app.
 *
 * - Light + dark palettes are tuned to the brand teal/ink.
 * - On Android 12+ we opt into dynamic color so users with Material
 *   You themes get a personalized palette; pass `dynamicColor = false`
 *   in previews / brand-critical screens to force the brand colors.
 */
private val LightColors = lightColorScheme(
    primary = XovenMartColors.PrimaryTeal,
    onPrimary = XovenMartColors.SurfaceWhite,
    primaryContainer = XovenMartColors.PrimaryTealLight,
    onPrimaryContainer = XovenMartColors.PrimaryTealDark,
    secondary = XovenMartColors.AccentAmber,
    onSecondary = XovenMartColors.SurfaceWhite,
    secondaryContainer = XovenMartColors.AccentAmberSoft,
    onSecondaryContainer = XovenMartColors.Ink900,
    background = XovenMartColors.Ink50,
    onBackground = XovenMartColors.Ink900,
    surface = XovenMartColors.SurfaceWhite,
    onSurface = XovenMartColors.Ink900,
    surfaceVariant = XovenMartColors.SurfaceMuted,
    onSurfaceVariant = XovenMartColors.Ink700,
    outline = XovenMartColors.Ink300,
    outlineVariant = XovenMartColors.Ink100,
    error = XovenMartColors.Error,
    onError = XovenMartColors.SurfaceWhite,
    errorContainer = XovenMartColors.ErrorSoft,
    onErrorContainer = XovenMartColors.Error,
)

private val DarkColors = darkColorScheme(
    primary = XovenMartColors.PrimaryTealLight,
    onPrimary = XovenMartColors.PrimaryTealDark,
    primaryContainer = XovenMartColors.PrimaryTealDark,
    onPrimaryContainer = XovenMartColors.PrimaryTealLight,
    secondary = XovenMartColors.AccentAmberSoft,
    onSecondary = XovenMartColors.Ink900,
    secondaryContainer = XovenMartColors.AccentAmber,
    onSecondaryContainer = XovenMartColors.Ink900,
    background = XovenMartColors.Ink900,
    onBackground = XovenMartColors.Ink50,
    surface = XovenMartColors.Ink700,
    onSurface = XovenMartColors.Ink50,
    surfaceVariant = XovenMartColors.Ink700,
    onSurfaceVariant = XovenMartColors.Ink100,
    outline = XovenMartColors.Ink500,
    outlineVariant = XovenMartColors.Ink700,
    error = XovenMartColors.ErrorSoft,
    onError = XovenMartColors.Error,
    errorContainer = XovenMartColors.Error,
    onErrorContainer = XovenMartColors.ErrorSoft,
)

@Composable
fun XovenMartTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    /** Pass `false` to skip dynamic color and force brand colors. */
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colors = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        darkTheme -> DarkColors
        else      -> LightColors
    }
    MaterialTheme(
        colorScheme = colors,
        typography = XovenMartTypography,
        shapes = XovenMartShapes,
        content = content,
    )
}