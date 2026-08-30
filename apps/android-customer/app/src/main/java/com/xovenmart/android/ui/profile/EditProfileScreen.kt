package com.xovenmart.android.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileScreen(
    onBack: () -> Unit,
    viewModel: EditProfileViewModel = hiltViewModel(),
) {
    val name by viewModel.name.collectAsState()
    val email by viewModel.email.collectAsState()
    val submitting by viewModel.submitting.collectAsState()
    val error by viewModel.error.collectAsState()
    val saved by viewModel.saved.collectAsState()

    LaunchedEffect(saved) {
        if (saved) onBack()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                title = { Text(stringResource(R.string.profile_action_edit), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = viewModel::onNameChange,
                label = { Text(stringResource(R.string.auth_field_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = email,
                onValueChange = viewModel::onEmailChange,
                label = { Text(stringResource(R.string.auth_field_email)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            if (error != null) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = error.orEmpty(),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = viewModel::save,
                enabled = !submitting && name.trim().length >= 2,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(stringResource(R.string.action_save))
                }
            }
        }
    }
}