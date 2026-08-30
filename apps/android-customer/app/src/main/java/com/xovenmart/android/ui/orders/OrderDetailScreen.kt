package com.xovenmart.android.ui.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.xovenmart.android.domain.model.OrderStatusEvent
import com.xovenmart.android.ui.common.components.ErrorState
import com.xovenmart.android.ui.common.components.LoadingState
import com.xovenmart.android.ui.common.state.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    orderId: String,
    onBack: () -> Unit,
    onTrack: (String) -> Unit,
    onReorderProduct: (String) -> Unit,
    viewModel: OrderDetailViewModel = hiltViewModel(),
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
                title = { Text("Order #$orderId", style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        when (val s = state) {
            is UiState.Loading -> LoadingState(Modifier.padding(padding))
            is UiState.Error -> ErrorState(s.message, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is UiState.Empty -> LoadingState(Modifier.padding(padding))
            is UiState.Success -> OrderDetailContent(
                order = s.data,
                contentPadding = padding,
                onTrack = onTrack,
                onReorderProduct = onReorderProduct,
            )
        }
    }
}

@Composable
private fun OrderDetailContent(
    order: Order,
    contentPadding: PaddingValues,
    onTrack: (String) -> Unit,
    onReorderProduct: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        contentPadding = PaddingValues(vertical = 12.dp, horizontal = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionCard(title = "Status") {
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
                if (!order.statusEvents.isNullOrEmpty()) {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
                    StatusTimeline(events = order.statusEvents!!)
                }
            }
        }
        item {
            SectionCard(title = "Items") {
                Column {
                    order.items.forEachIndexed { idx, item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    text = "৳${item.unitPrice.toInt()} × ${item.qty}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                text = "৳${item.lineTotal.toInt()}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        if (idx < order.items.lastIndex) {
                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                        }
                    }
                }
            }
        }
        item {
            SectionCard(title = "Summary") {
                Column {
                    SummaryRow("Subtotal", order.subtotal)
                    if (order.discountTotal > 0) {
                        SummaryRow(
                            "Discount",
                            -order.discountTotal,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    }
                    SummaryRow("Delivery fee", order.deliveryFee)
                    HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
                    SummaryRow("Total", order.grandTotal, bold = true, color = MaterialTheme.colorScheme.primary)
                    if (!order.couponCode.isNullOrBlank()) {
                        Text(
                            text = "Coupon: ${order.couponCode}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    Text(
                        text = "Payment: ${order.paymentMethod}" + (order.paymentStatus?.let { " ($it)" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        if (order.address != null) {
            item {
                SectionCard(title = "Delivery address") {
                    Text(
                        text = listOfNotNull(order.address.label, order.address.fullText, order.address.landmark)
                            .filter { it.isNotBlank() }
                            .joinToString("\n"),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
        if (order.delivery != null && order.delivery.riderName != null) {
            item {
                SectionCard(title = "Rider") {
                    Text(
                        text = order.delivery.riderName + (order.delivery.riderPhone?.let { " · $it" } ?: ""),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = { onTrack(order.orderNo) },
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.track_title)) }
                OutlinedButton(
                    onClick = { onReorderProduct(order.items.first().productId) },
                    enabled = order.items.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                ) { Text("Reorder") }
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            content()
        }
    }
}

@Composable
private fun SummaryRow(
    label: String,
    value: Double,
    bold: Boolean = false,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = if (bold) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        )
        Text(
            text = "৳${value.toInt()}",
            style = if (bold) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
            color = color,
            fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun StatusTimeline(events: List<OrderStatusEvent>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        events.forEach { ev ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(end = 4.dp)
                        .padding(2.dp),
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
    }
}