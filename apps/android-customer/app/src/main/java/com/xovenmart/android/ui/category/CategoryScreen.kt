package com.xovenmart.android.ui.category

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.Category
import com.xovenmart.android.ui.common.components.EmptyState
import com.xovenmart.android.ui.common.components.ErrorState
import com.xovenmart.android.ui.common.components.LoadingState
import com.xovenmart.android.ui.common.components.ProductCard
import com.xovenmart.android.ui.common.components.TopAppBarWithCart
import com.xovenmart.android.ui.common.state.UiState

@Composable
fun CategoryScreen(
    slug: String,
    onBack: () -> Unit,
    onProductClick: (String) -> Unit,
    onCartClick: () -> Unit,
    viewModel: CategoryViewModel = hiltViewModel(),
) {
    val category by viewModel.category.collectAsState()
    val products by viewModel.products.collectAsState()
    val cartCount by viewModel.cartCount.collectAsState()
    val title = (category as? UiState.Success<Category>)?.data?.nameEn ?: slug

    Scaffold(
        topBar = {
            TopAppBarWithCart(
                title = title,
                cartItemCount = cartCount,
                onBack = onBack,
                onCart = onCartClick,
            )
        },
    ) { padding ->
        when (val s = products) {
            is UiState.Loading -> LoadingState(Modifier.padding(padding))
            is UiState.Error   -> ErrorState(s.message, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is UiState.Empty   -> EmptyState(title = stringResource(R.string.cart_empty))
            is UiState.Success -> {
                if (s.data.isEmpty()) {
                    EmptyState(title = stringResource(R.string.cart_empty))
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxSize().padding(padding),
                    ) {
                        items(s.data, key = { it.id }) { p ->
                            ProductCard(
                                product = p,
                                onClick = { onProductClick(p.slug) },
                                onAdd = { viewModel.addToCart(p) },
                            )
                        }
                    }
                }
            }
        }
    }
}