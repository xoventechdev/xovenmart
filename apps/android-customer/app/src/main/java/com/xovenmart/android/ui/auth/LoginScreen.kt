package com.xovenmart.android.ui.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R

@Composable
fun LoginScreen(
    onAuthSuccess: () -> Unit,
    onNavigateRegister: () -> Unit,
    onNavigateForgot: () -> Unit,
    onNavigateOtp: () -> Unit,
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val phoneState = rememberSaveable { mutableStateOf("") }
    val passwordState = rememberSaveable { mutableStateOf("") }
    val ui = rememberAuthUi(authViewModel)

    // If verifyOtp decided we need to register, jump there.
    ConsumeNavigationEffect(
        flag = ui.navigateToSetPassword || ui.navigateToRegister,
        onConsumed = authViewModel::consumeNavigation,
        onNavigate = onNavigateOtp,
    )

    AuthScreenScaffold {
        Column {
            ErrorBanner(message = ui.error, onDismiss = authViewModel::clearError)
            PhoneField(value = phoneState.value, onChange = { phoneState.value = it })
            Spacer(Modifier.height(8.dp))
            PasswordField(value = passwordState.value, onChange = { passwordState.value = it })
            Spacer(Modifier.height(16.dp))
            SubmitButton(
                text = stringResource(R.string.auth_action_login),
                submitting = ui.submitting,
                enabled = phoneState.value.length >= 11 && passwordState.value.length >= 6,
                onClick = {
                    authViewModel.login(phoneState.value, passwordState.value)
                },
            )
            Spacer(Modifier.height(8.dp))
            SubmitButton(
                text = stringResource(R.string.auth_action_send_otp),
                submitting = false,
                enabled = phoneState.value.length >= 11,
                onClick = {
                    authViewModel.requestOtp(phoneState.value)
                    onNavigateOtp()
                },
            )
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = onNavigateForgot) {
                Text(stringResource(R.string.auth_link_to_forgot))
            }
            TextButton(onClick = onNavigateRegister) {
                Text(stringResource(R.string.auth_link_to_register))
            }
        }
    }
}