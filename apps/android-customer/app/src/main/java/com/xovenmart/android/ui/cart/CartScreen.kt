package com.xovenmart.android.ui.cart

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.CartItem
import com.xovenmart.android.ui.common.components.EmptyState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartScreen(
    onBack: () -> Unit,
    onCheckout: () -> Unit,
    onAuthRequired: () -> Unit,
    onProductClick: (String) -> Unit = {},
    viewModel: CartViewModel = hiltViewModel(),
) {
    val items by viewModel.items.collectAsState()
    val subtotal by viewModel.subtotal.collectAsState()
    val mrpTotal by viewModel.mrpTotal.collectAsState()
    val totalCount by viewModel.totalItems.collectAsState()
    val savings = (mrpTotal - subtotal).coerceAtLeast(0.0)

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                title = { Text(stringResource(R.string.cart_title), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        bottomBar = {
            if (items.isNotEmpty()) {
                CartFooter(
                    itemCount = totalCount,
                    subtotal = subtotal,
                    savings = savings,
                    onCheckout = onCheckout,
                )
            }
        },
    ) { padding ->
        if (items.isEmpty()) {
            EmptyState(
                title = stringResource(R.string.cart_empty),
                modifier = Modifier.padding(padding),
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(items, key = { it.id }) { item ->
                    CartItemRow(
                        item = item,
                        onClick = { onProductClick(item.slug) },
                        onIncrement = { viewModel.increment(item) },
                        onDecrement = { viewModel.decrement(item) },
                        onRemove = { viewModel.remove(item) },
                    )
                }
            }
        }
    }
}

@Composable
private fun CartItemRow(
    item: CartItem,
    onClick: () -> Unit,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onRemove: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (item.image != null) {
                    AsyncImage(
                        model = item.image,
                        contentDescription = item.nameEn,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Text(
                        text = item.nameEn.take(1).uppercase(),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.nameEn,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (item.unit.isNotBlank()) {
                    Text(
                        text = item.unit,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(
                    modifier = Modifier.padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "৳${item.unitPrice.toInt()}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (item.discountPct() > 0) {
                        Text(
                            text = "৳${item.mrp.toInt()}",
                            style = MaterialTheme.typography.bodySmall,
                            textDecoration = TextDecoration.LineThrough,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                QtyStepper(
                    qty = item.qty,
                    onMinus = onDecrement,
                    onPlus = onIncrement,
                )
            }
            IconButton(onClick = onRemove) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.action_delete),
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun QtyStepper(qty: Int, onMinus: () -> Unit, onPlus: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.padding(top = 6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = onMinus,
                enabled = qty > 1,
                modifier = Modifier.size(36.dp),
            ) {
                Icon(Icons.Filled.Remove, contentDescription = "Decrease")
            }
            Text(
                text = qty.toString(),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            IconButton(
                onClick = onPlus,
                modifier = Modifier.size(36.dp),
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Increase")
            }
        }
    }
}

@Composable
private fun CartFooter(
    itemCount: Int,
    subtotal: Double,
    savings: Double,
    onCheckout: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 6.dp,
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "$itemCount item${if (itemCount == 1) "" else "s"}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "৳${subtotal.toInt()}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            if (savings > 0) {
                Text(
                    text = "You save ৳${savings.toInt()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            Button(
                onClick = onCheckout,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.cart_action_checkout))
            }
        }
    }
}

private fun CartItem.discountPct(): Int {
    if (mrp <= 0.0 || unitPrice >= mrp) return 0
    return (((mrp - unitPrice) / mrp) * 100).toInt()
}