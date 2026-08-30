package com.xovenmart.android.ui.profile.addresses

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.Address
import com.xovenmart.android.ui.common.components.EmptyState
import com.xovenmart.android.ui.common.components.ErrorState
import com.xovenmart.android.ui.common.components.LoadingState
import com.xovenmart.android.ui.common.state.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressesScreen(
    onBack: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (String) -> Unit,
    viewModel: AddressesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                title = { Text(stringResource(R.string.profile_action_addresses), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onAdd,
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Add address") },
            )
        },
    ) { padding ->
        when (val s = state) {
            is UiState.Loading -> LoadingState(Modifier.padding(padding))
            is UiState.Error -> ErrorState(s.message, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is UiState.Empty -> EmptyState(
                title = "No addresses yet",
                body = "Tap the + button to add your first delivery address.",
                modifier = Modifier.padding(padding),
            )
            is UiState.Success -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(s.data, key = { it.id }) { address ->
                    AddressCard(
                        address = address,
                        onEdit = { onEdit(address.id) },
                        onDelete = { viewModel.delete(address.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AddressCard(
    address: Address,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onEdit),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (address.isDefault) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(end = 2.dp),
                        )
                    }
                    Text(
                        text = address.label ?: "Address",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Text(
                    text = address.area,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = address.fullText,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!address.landmark.isNullOrBlank()) {
                    Text(
                        text = "Landmark: ${address.landmark}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.action_edit))
            }
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.action_delete),
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}