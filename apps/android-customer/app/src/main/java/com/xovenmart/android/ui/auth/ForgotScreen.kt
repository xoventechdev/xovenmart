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
fun ForgotScreen(
    onAuthSuccess: () -> Unit,
    onBack: () -> Unit,
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val phone = rememberSaveable { mutableStateOf("") }
    val otpCode = rememberSaveable { mutableStateOf("") }
    val newPassword = rememberSaveable { mutableStateOf("") }
    val ui = rememberAuthUi(authViewModel)
    val pendingPhone = rememberPendingPhone(authViewModel)
    val resetActive = pendingPhone != null
    val authState by authViewModel.authState.collectAsStateValue()
    if (authState == AuthState.Authenticated) onAuthSuccess()

    AuthScreenScaffold(onBack = onBack) {
        Column {
            ErrorBanner(message = ui.error, onDismiss = authViewModel::clearError)
            PhoneField(value = phone.value, onChange = { phone.value = it })
            if (ui.devCode != null && !resetActive) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Dev code: ${ui.devCode}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }
            if (resetActive) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = otpCode.value,
                    onValueChange = { v -> otpCode.value = v.filter { it.isDigit() }.take(6) },
                    label = { Text(stringResource(R.string.auth_field_otp)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                PasswordField(
                    value = newPassword.value,
                    onChange = { newPassword.value = it },
                    label = "New password",
                )
            }
            Spacer(Modifier.height(16.dp))
            if (resetActive) {
                SubmitButton(
                    text = "Reset password",
                    submitting = ui.submitting,
                    enabled = otpCode.value.length == 6 && newPassword.value.length >= 6,
                    onClick = { authViewModel.resetPassword(otpCode.value, newPassword.value) },
                )
            } else {
                SubmitButton(
                    text = stringResource(R.string.auth_action_forgot),
                    submitting = ui.submitting,
                    enabled = phone.value.length >= 11,
                    onClick = { authViewModel.forgotPassword(phone.value) },
                )
            }
        }
    }
}