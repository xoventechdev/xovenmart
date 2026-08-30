package com.xovenmart.android.ui.track

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.Order
import com.xovenmart.android.domain.model.OrderStatusEvent
import com.xovenmart.android.ui.common.state.UiState
import com.xovenmart.android.ui.orders.StatusChip

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrackScreen(
    initialOrderNo: String?,
    onBack: () -> Unit,
    viewModel: TrackViewModel = hiltViewModel(),
) {
    val orderNo by viewModel.orderNo.collectAsState()
    val phone by viewModel.phone.collectAsState()
    val state by viewModel.state.collectAsState()

    LaunchedEffect(initialOrderNo) {
        if (!initialOrderNo.isNullOrBlank()) {
            viewModel.onOrderNoChange(initialOrderNo)
            viewModel.track()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                title = { Text(stringResource(R.string.track_title), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.track_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = orderNo,
                onValueChange = viewModel::onOrderNoChange,
                label = { Text("Order number") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = phone,
                onValueChange = viewModel::onPhoneChange,
                label = { Text(stringResource(R.string.auth_field_phone) + " (optional)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = viewModel::track,
                enabled = orderNo.trim().isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.track_action_track))
            }

            when (val s = state) {
                is UiState.Loading -> Text(
                    text = "Looking up your order…",
                    style = MaterialTheme.typography.bodyMedium,
                )
                is UiState.Error -> Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = s.message,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp),
                    )
                }
                is UiState.Empty -> Unit
                is UiState.Success -> TrackResult(s.data)
            }
        }
    }
}

@Composable
private fun TrackResult(order: Order) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Order #${order.orderNo}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = order.placedAt?.substringBefore('T') ?: "—",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusChip(status = order.status)
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            if (!order.statusEvents.isNullOrEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    order.statusEvents.forEach { ev ->
                        EventRow(ev)
                    }
                }
            } else {
                Text(
                    text = "Current status: ${order.status.name}",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            if (order.delivery?.riderName != null) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                Text(
                    text = "Rider: ${order.delivery.riderName}" +
                        (order.delivery.riderPhone?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun EventRow(ev: OrderStatusEvent) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Surface(
            shape = RoundedCornerShape(4.dp),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(end = 4.dp),
        ) {
            Text(
                text = " ",
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(4.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = ev.to,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            if (!ev.note.isNullOrBlank()) {
                Text(
                    text = ev.note,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(
            text = ev.at.substringBefore('T'),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}