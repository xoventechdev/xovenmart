package com.xovenmart.android.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.xovenmart.android.R

/** Phone-number field that limits input to digits and renders a numeric keyboard. */
@Composable
fun PhoneField(
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.filter { c -> c.isDigit() }.take(14)) },
        label = { Text(stringResource(R.string.auth_field_phone)) },
        singleLine = true,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        modifier = modifier.fillMaxWidth(),
    )
}

/** Password field with reveal toggle. */
@Composable
fun PasswordField(
    value: String,
    onChange: (String) -> Unit,
    label: String = stringResource(R.string.auth_field_password),
    modifier: Modifier = Modifier,
    error: String? = null,
) {
    var revealed by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        visualTransformation = if (revealed) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = { revealed = !revealed }) {
                Icon(
                    imageVector = if (revealed) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = null,
                )
            }
        },
        modifier = modifier.fillMaxWidth(),
    )
}

/** Submit button with spinner. */
@Composable
fun SubmitButton(
    text: String,
    submitting: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !submitting,
        modifier = modifier.fillMaxWidth(),
    ) {
        if (submitting) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            Text(text)
        }
    }
}

/** Renders a one-shot error banner above the form. Auto-dismisses on click. */
@Composable
fun ErrorBanner(
    message: String?,
    onDismiss: () -> Unit,
) {
    if (message.isNullOrBlank()) return
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp),
    ) {
        Box(modifier = Modifier.padding(12.dp)) {
            Text(message, modifier = Modifier.padding(end = 8.dp))
            TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.CenterEnd)) {
                Text("×")
            }
        }
    }
}

/** Centered "XovenMart" branding header. */
@Composable
fun BrandHeader(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineLarge,
        )
        Text(
            text = stringResource(R.string.tagline_30_min),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Standard auth-screen scaffold. */
@Composable
fun AuthScreenScaffold(
    onBack: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (onBack != null) {
            TextButton(onClick = onBack) {
                Text(stringResource(R.string.action_back))
            }
        }
        Spacer(Modifier.height(16.dp))
        BrandHeader()
        Spacer(Modifier.height(24.dp))
        content()
    }
}

/** Helper to react to a one-shot navigation event from the VM. */
@Composable
fun ConsumeNavigationEffect(
    flag: Boolean,
    onConsumed: () -> Unit,
    onNavigate: () -> Unit,
) {
    LaunchedEffect(flag) {
        if (flag) {
            onNavigate()
            onConsumed()
        }
    }
}

/** Convenience: collect [AuthViewModel.ui] as state in a screen. */
@Composable
fun rememberAuthUi(authViewModel: AuthViewModel): AuthUiState {
    val ui by authViewModel.ui.collectAsState()
    return ui
}

/** Convenience: collect [AuthViewModel.pendingPhone] as state. */
@Composable
fun rememberPendingPhone(authViewModel: AuthViewModel): String? {
    val phone by authViewModel.pendingPhone.collectAsState()
    return phone
}

/** Remember a saveable string. */
@Composable
fun rememberText(initial: String = "") = rememberSaveable { mutableStateOf(initial) }