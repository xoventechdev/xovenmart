package com.xovenmart.android.ui.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R

@Composable
fun RegisterScreen(
    onAuthSuccess: () -> Unit,
    onBack: () -> Unit,
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var referral by remember { mutableStateOf("") }
    val ui = rememberAuthUi(authViewModel)
    val otpState = rememberPendingPhone(authViewModel)
    if (otpState != null && phone.isEmpty()) phone = otpState

    AuthScreenScaffold(onBack = onBack) {
        Column {
            ErrorBanner(message = ui.error, onDismiss = authViewModel::clearError)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.auth_field_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            PhoneField(value = phone, onChange = { phone = it })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("${stringResource(R.string.auth_field_email)}") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            PasswordField(value = password, onChange = { password = it })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = referral,
                onValueChange = { referral = it.uppercase() },
                label = { Text(stringResource(R.string.auth_field_referral)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            SubmitButton(
                text = stringResource(R.string.auth_action_register),
                submitting = ui.submitting,
                enabled = name.length >= 2 && phone.length >= 11 && password.length >= 6,
                onClick = {
                    authViewModel.setPendingPhone(phone)
                    authViewModel.register(
                        phone = phone,
                        name = name,
                        password = password,
                        email = email.takeIf { it.isNotBlank() },
                        otpCode = null,
                        referralCode = referral.takeIf { it.isNotBlank() },
                    )
                },
            )
        }
    }
}