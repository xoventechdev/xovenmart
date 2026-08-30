package com.xovenmart.android.ui.common.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.xovenmart.android.domain.model.ProductSummary
import java.util.Locale

/**
 * Compact product card — used by Home / Category / Search.
 *
 * Renders image, name (Bn), unit, price + discount, and an Add button.
 * Tapping the card body navigates to product detail; the + icon adds
 * to cart with qty=1.
 */
@Composable
fun ProductCard(
    product: ProductSummary,
    onClick: () -> Unit,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (product.image != null) {
                    AsyncImage(
                        model = product.image,
                        contentDescription = product.nameEn,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Text(
                        text = product.nameEn.take(1).uppercase(Locale.US),
                        style = MaterialTheme.typography.headlineLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (!product.inStock) {
                    OutOfStockBadge()
                }
            }
            Column(modifier = Modifier.padding(8.dp)) {
                Text(
                    text = product.nameBn,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = product.unit,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            text = "৳${product.salePrice.toInt()}",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        if (product.discountPct > 0) {
                            Text(
                                text = "৳${product.mrp.toInt()}",
                                style = MaterialTheme.typography.bodySmall,
                                textDecoration = TextDecoration.LineThrough,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    IconButton(
                        onClick = onAdd,
                        enabled = product.inStock,
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Add,
                            contentDescription = "Add to cart",
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OutOfStockBadge() {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(MaterialTheme.colorScheme.errorContainer)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            text = "Out of stock",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onErrorContainer,
        )
    }
}