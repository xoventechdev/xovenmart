package com.xovenmart.android.ui.profile.addresses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressFormScreen(
    addressId: String?,
    onBack: () -> Unit,
    viewModel: AddressFormViewModel = hiltViewModel(),
) {
    val label by viewModel.label.collectAsState()
    val area by viewModel.area.collectAsState()
    val landmark by viewModel.landmark.collectAsState()
    val fullText by viewModel.fullText.collectAsState()
    val isDefault by viewModel.isDefault.collectAsState()
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
                title = {
                    Text(
                        text = if (addressId != null) "Edit address" else "New address",
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
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
                value = label,
                onValueChange = viewModel::onLabelChange,
                label = { Text("Label (e.g. Home, Office)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = area,
                onValueChange = viewModel::onAreaChange,
                label = { Text("Area / thana") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = landmark,
                onValueChange = viewModel::onLandmarkChange,
                label = { Text("Landmark (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = fullText,
                onValueChange = viewModel::onFullTextChange,
                label = { Text("Full address") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3,
                placeholder = { Text("House, road, etc.") },
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(text = "Set as default address", style = MaterialTheme.typography.bodyLarge)
                Switch(checked = isDefault, onCheckedChange = viewModel::onDefaultChange)
            }

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

            Spacer(Modifier.height(4.dp))
            Button(
                onClick = viewModel::save,
                enabled = !submitting && area.isNotBlank() && fullText.isNotBlank(),
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