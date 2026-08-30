package com.xovenmart.android.ui.common.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.xovenmart.android.R

/**
 * Friendly error surface. Pulls `error_unknown` / `error_network`
 * from strings.xml when no [message] is supplied.
 */
@Composable
fun ErrorState(
    message: String? = null,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val text = message ?: stringResource(id = R.string.error_unknown)
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null) {
            Button(
                onClick = onRetry,
                modifier = Modifier.padding(top = 16.dp),
            ) {
                Text(stringResource(id = R.string.action_retry))
            }
        }
    }
}