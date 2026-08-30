package com.xovenmart.android.ui.orders

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
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
import com.xovenmart.android.domain.model.Order
import com.xovenmart.android.domain.model.OrderStatus
import com.xovenmart.android.ui.common.components.EmptyState
import com.xovenmart.android.ui.common.components.ErrorState
import com.xovenmart.android.ui.common.components.LoadingState
import com.xovenmart.android.ui.common.state.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersListScreen(
    onBack: () -> Unit,
    onOrderClick: (String) -> Unit,
    viewModel: OrdersListViewModel = hiltViewModel(),
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
                title = { Text(stringResource(R.string.orders_title), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        when (val s = state) {
            is UiState.Loading -> LoadingState(Modifier.padding(padding))
            is UiState.Error -> ErrorState(
                message = s.message,
                onRetry = viewModel::load,
                modifier = Modifier.padding(padding),
            )
            is UiState.Empty -> EmptyState(
                title = stringResource(R.string.orders_empty),
                modifier = Modifier.padding(padding),
            )
            is UiState.Success -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(s.data, key = { it.id }) { order ->
                        OrderRow(order = order, onClick = { onOrderClick(order.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderRow(order: Order, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shape = RoundedCornerShape(12.dp),
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
                        text = order.placedAt?.let { formatDate(it) } ?: "—",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusChip(status = order.status)
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "${order.items.size} item${if (order.items.size == 1) "" else "s"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "৳${order.grandTotal.toInt()}",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
fun StatusChip(status: OrderStatus) {
    val cs = MaterialTheme.colorScheme
    val (label, container, content) = when (status) {
        OrderStatus.PENDING          -> Triple("Pending", cs.tertiaryContainer, cs.onTertiaryContainer)
        OrderStatus.ACCEPTED         -> Triple("Accepted", cs.secondaryContainer, cs.onSecondaryContainer)
        OrderStatus.PREPARING        -> Triple("Preparing", cs.secondaryContainer, cs.onSecondaryContainer)
        OrderStatus.PREPARED         -> Triple("Prepared", cs.secondaryContainer, cs.onSecondaryContainer)
        OrderStatus.OUT_FOR_DELIVERY -> Triple("Out for delivery", cs.primaryContainer, cs.onPrimaryContainer)
        OrderStatus.DELIVERED        -> Triple("Delivered", cs.secondaryContainer, cs.onSecondaryContainer)
        OrderStatus.CANCELLED        -> Triple("Cancelled", cs.errorContainer, cs.onErrorContainer)
        OrderStatus.RETURNED         -> Triple("Returned", cs.errorContainer, cs.onErrorContainer)
        OrderStatus.REFUNDED         -> Triple("Refunded", cs.errorContainer, cs.onErrorContainer)
    }
    Surface(
        color = container,
        shape = RoundedCornerShape(8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = content,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

private fun formatDate(iso: String): String {
    // Light-touch: keep the ISO fragment up to first 'T'. Backend already
    // localizes for admin/web; in v1 we just trim the time portion.
    val date = iso.substringBefore('T')
    val time = iso.substringAfter('T').take(5)
    return if (time.isBlank()) date else "$date · $time"
}