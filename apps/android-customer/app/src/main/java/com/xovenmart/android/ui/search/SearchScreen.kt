package com.xovenmart.android.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Search as SearchIcon
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.ProductSearchHit
import com.xovenmart.android.ui.common.components.EmptyState
import com.xovenmart.android.ui.common.components.ErrorState
import com.xovenmart.android.ui.common.components.LoadingState
import com.xovenmart.android.ui.common.state.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    onBack: () -> Unit,
    onProductClick: (String) -> Unit,
    onCartClick: () -> Unit,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val query by viewModel.query.collectAsState()
    val hits by viewModel.hits.collectAsState()
    val cartCount by viewModel.cartCount.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                title = {
                    OutlinedTextField(
                        value = query,
                        onValueChange = viewModel::onQueryChange,
                        placeholder = { Text(stringResource(R.string.search_hint)) },
                        singleLine = true,
                        leadingIcon = { Icon(Icons.Filled.SearchIcon, contentDescription = null) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = viewModel::clearQuery) {
                                    Icon(Icons.Filled.Clear, contentDescription = "Clear")
                                }
                            }
                        },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        shape = RoundedCornerShape(24.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
                actions = {
                    IconButton(onClick = onCartClick) {
                        BadgedBox(
                            badge = {
                                if (cartCount > 0) {
                                    Badge { Text(cartCount.toString()) }
                                }
                            },
                        ) {
                            Icon(Icons.Filled.ShoppingCart, contentDescription = stringResource(R.string.cart_title))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        when (val s = hits) {
            is UiState.Loading -> LoadingState(Modifier.padding(padding))
            is UiState.Error -> ErrorState(
                message = s.message,
                onRetry = viewModel::retry,
                modifier = Modifier.padding(padding),
            )
            is UiState.Empty -> {
                if (query.trim().length < 2) {
                    EmptyState(
                        title = stringResource(R.string.search_prompt_title),
                        body = stringResource(R.string.search_prompt_subtitle),
                        modifier = Modifier.padding(padding),
                    )
                } else {
                    EmptyState(
                        title = stringResource(R.string.search_empty_title),
                        body = stringResource(R.string.search_empty_subtitle, query),
                        modifier = Modifier.padding(padding),
                    )
                }
            }
            is UiState.Success -> {
                if (s.data.isEmpty()) {
                    EmptyState(
                        title = stringResource(R.string.search_empty_title),
                        body = stringResource(R.string.search_empty_subtitle, query),
                        modifier = Modifier.padding(padding),
                    )
                } else {
                    SearchResults(
                        hits = s.data,
                        onProductClick = onProductClick,
                        onAdd = viewModel::addHitToCart,
                        contentPadding = padding,
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchResults(
    hits: List<ProductSearchHit>,
    onProductClick: (String) -> Unit,
    onAdd: (ProductSearchHit) -> Unit,
    contentPadding: PaddingValues,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(contentPadding),
        contentPadding = PaddingValues(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(hits, key = { it.id }) { hit ->
            SearchHitRow(
                hit = hit,
                onClick = { onProductClick(hit.slug) },
                onAdd = { onAdd(hit) },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }
    }
}

@Composable
private fun SearchHitRow(
    hit: ProductSearchHit,
    onClick: () -> Unit,
    onAdd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            if (hit.image != null) {
                AsyncImage(
                    model = hit.image,
                    contentDescription = hit.nameEn,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(
                    text = hit.nameEn.take(1).uppercase(),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = hit.nameEn,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "৳${hit.price.toInt()}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        IconButton(onClick = onAdd) {
            Icon(
                imageVector = Icons.Filled.Add,
                contentDescription = "Add to cart",
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}