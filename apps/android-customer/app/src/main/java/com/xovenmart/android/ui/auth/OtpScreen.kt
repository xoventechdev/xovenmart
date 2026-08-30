package com.xovenmart.android.ui.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.AuthState

@Composable
fun OtpScreen(
    onAuthSuccess: () -> Unit,
    onBack: () -> Unit,
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val codeState = rememberSaveable { mutableStateOf("") }
    val ui = rememberAuthUi(authViewModel)
    val phone = rememberPendingPhone(authViewModel)
    val authState by authViewModel.authState.collectAsStateValue()
    if (authState == AuthState.Authenticated) onAuthSuccess()

    AuthScreenScaffold(onBack = onBack) {
        Column {
            ErrorBanner(message = ui.error, onDismiss = authViewModel::clearError)
            if (phone != null) {
                Text(
                    text = "Verifying $phone",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(8.dp))
            }
            OutlinedTextField(
                value = codeState.value,
                onValueChange = { v -> codeState.value = v.filter { it.isDigit() }.take(6) },
                label = { Text(stringResource(R.string.auth_field_otp)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                modifier = Modifier.fillMaxWidth(),
            )
            if (ui.devCode != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Dev code: ${ui.devCode}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }
            Spacer(Modifier.height(16.dp))
            SubmitButton(
                text = stringResource(R.string.auth_action_verify),
                submitting = ui.submitting,
                enabled = codeState.value.length == 6,
                onClick = { authViewModel.verifyOtp(codeState.value) },
            )
            Spacer(Modifier.height(8.dp))
            SubmitButton(
                text = stringResource(R.string.auth_action_resend_otp),
                submitting = ui.submitting,
                enabled = phone != null,
                onClick = { phone?.let { authViewModel.requestOtp(it) } },
            )
        }
    }
}