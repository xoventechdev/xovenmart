package com.xovenmart.android.ui.product

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.ProductDetail
import com.xovenmart.android.ui.common.components.ErrorState
import com.xovenmart.android.ui.common.components.LoadingState
import com.xovenmart.android.ui.common.components.TopAppBarWithCart
import com.xovenmart.android.ui.common.state.UiState

@Composable
fun ProductDetailScreen(
    slug: String,
    onBack: () -> Unit,
    onCartClick: () -> Unit,
    onCheckout: () -> Unit,
    viewModel: ProductDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val qty by viewModel.qty.collectAsState()
    val cartCount by viewModel.cartCount.collectAsState()

    Scaffold(
        topBar = {
            TopAppBarWithCart(
                title = (state as? UiState.Success<ProductDetail>)?.data?.summary?.nameEn ?: slug,
                cartItemCount = cartCount,
                onBack = onBack,
                onCart = onCartClick,
            )
        },
    ) { padding ->
        when (val s = state) {
            is UiState.Loading -> LoadingState(Modifier.padding(padding))
            is UiState.Error   -> ErrorState(s.message, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is UiState.Empty   -> LoadingState(Modifier.padding(padding))
            is UiState.Success -> {
                val product = s.data
                Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp),
                    ) {
                        item {
                            val firstImage = product.images.firstOrNull()?.url
                                ?: product.summary.image
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(1f)
                                    .background(MaterialTheme.colorScheme.surfaceVariant),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (firstImage != null) {
                                    AsyncImage(
                                        model = firstImage,
                                        contentDescription = product.summary.nameEn,
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop,
                                    )
                                }
                            }
                        }
                        item {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = product.summary.nameBn,
                                    style = MaterialTheme.typography.headlineMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = product.summary.unit,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Row(
                                    modifier = Modifier.padding(top = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(
                                        text = "৳${product.summary.salePrice.toInt()}",
                                        style = MaterialTheme.typography.titleLarge,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    if (product.summary.discountPct > 0) {
                                        Text(
                                            text = "৳${product.summary.mrp.toInt()}",
                                            style = MaterialTheme.typography.bodyMedium,
                                            textDecoration = TextDecoration.LineThrough,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Surface(
                                            color = MaterialTheme.colorScheme.errorContainer,
                                            shape = RoundedCornerShape(6.dp),
                                        ) {
                                            Text(
                                                text = "-${product.summary.discountPct}%",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onErrorContainer,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                            )
                                        }
                                    }
                                }
                                if (!product.summary.inStock) {
                                    Text(
                                        text = "Out of stock",
                                        color = MaterialTheme.colorScheme.error,
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.padding(top = 8.dp),
                                    )
                                }
                                HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                                Text(
                                    text = "Description",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    text = product.descriptionEn ?: product.descriptionBn ?: "—",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                            }
                        }
                        if (product.images.size > 1) {
                            item {
                                LazyRow(
                                    modifier = Modifier.padding(8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    items(product.images, key = { it.url }) { img ->
                                        AsyncImage(
                                            model = img.url,
                                            contentDescription = img.altEn,
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier
                                                .size(72.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(MaterialTheme.colorScheme.surfaceVariant),
                                        )
                                    }
                                }
                            }
                        }
                    }
                    // Footer with qty stepper + add-to-cart
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shadowElevation = 6.dp,
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            QtyStepper(qty = qty, onMinus = viewModel::decrement, onPlus = viewModel::increment)
                            Button(
                                onClick = { viewModel.addToCart(onCheckout) },
                                enabled = product.summary.inStock,
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(stringResource(R.string.cart_action_checkout))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QtyStepper(qty: Int, onMinus: () -> Unit, onPlus: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onMinus) {
                Icon(Icons.Filled.Remove, contentDescription = "Decrease")
            }
            Text(
                text = qty.toString(),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            IconButton(onClick = onPlus) {
                Icon(Icons.Filled.Add, contentDescription = "Increase")
            }
        }
    }
}