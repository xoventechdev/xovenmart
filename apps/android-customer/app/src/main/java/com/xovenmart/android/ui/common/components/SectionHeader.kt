package com.xovenmart.android.ui.common.components

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Section title used in lists — Home / Category / Search all render one
 * per section. Just a styled `Text` for now; can evolve to include an
 * "See all" affordance later.
 */
@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}