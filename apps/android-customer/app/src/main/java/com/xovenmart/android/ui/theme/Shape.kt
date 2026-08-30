package com.xovenmart.android.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Shape tokens. XovenMart leans warm and friendly — rounded corners
 * everywhere, with a slightly chunkier default for cards.
 */
val XovenMartShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small      = RoundedCornerShape(10.dp),
    medium     = RoundedCornerShape(14.dp),
    large      = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)