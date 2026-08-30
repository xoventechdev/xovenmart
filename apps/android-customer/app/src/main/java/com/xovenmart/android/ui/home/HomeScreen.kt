package com.xovenmart.android.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
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
import com.xovenmart.android.domain.model.ProductSummary
import com.xovenmart.android.ui.common.components.EmptyState
import com.xovenmart.android.ui.common.components.ErrorState
import com.xovenmart.android.ui.common.components.LoadingState
import com.xovenmart.android.ui.common.components.ProductCard
import com.xovenmart.android.ui.common.components.SectionHeader
import com.xovenmart.android.ui.common.components.TopAppBarWithCart
import com.xovenmart.android.ui.common.state.UiState

@Composable
fun HomeScreen(
    onCategoryClick: (String) -> Unit,
    onProductClick: (String) -> Unit,
    onCartClick: () -> Unit,
    onSearchClick: () -> Unit,
    onProfileClick: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val featured by viewModel.featured.collectAsState()
    val categories by viewModel.categories.collectAsState()
    val cartCount by viewModel.cartCount.collectAsState()

    Scaffold(
        topBar = {
            TopAppBarWithCart(
                title = stringResource(R.string.app_name),
                cartItemCount = cartCount,
                onSearch = onSearchClick,
                onProfile = onProfileClick,
                onCart = onCartClick,
            )
        },
    ) { padding ->
        when {
            featured is UiState.Loading && categories is UiState.Loading -> LoadingState(Modifier.padding(padding))
            featured is UiState.Error -> ErrorState(
                message = (featured as UiState.Error).message,
                onRetry = viewModel::load,
                modifier = Modifier.padding(padding),
            )
            else -> {
                val featuredList = (featured as? UiState.Success)?.data.orEmpty()
                val categoryList = (categories as? UiState.Success)?.data.orEmpty()
                if (featuredList.isEmpty() && categoryList.isEmpty()) {
                    EmptyState(title = stringResource(R.string.cart_empty))
                } else {
                    HomeContent(
                        padding = padding,
                        featured = featuredList,
                        categories = categoryList,
                        onCategoryClick = onCategoryClick,
                        onProductClick = onProductClick,
                        onAddToCart = viewModel::addToCart,
                    )
                }
            }
        }
    }
}

@Composable
private fun HomeContent(
    padding: PaddingValues,
    featured: List<ProductSummary>,
    categories: List<Category>,
    onCategoryClick: (String) -> Unit,
    onProductClick: (String) -> Unit,
    onAddToCart: (ProductSummary) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (categories.isNotEmpty()) {
            item {
                Column {
                    SectionHeader(title = stringResource(R.string.home_section_categories))
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(categories, key = { it.id }) { c ->
                            CategoryChip(
                                name = c.nameEn,
                                onClick = { onCategoryClick(c.slug) },
                            )
                        }
                    }
                }
            }
        }
        if (featured.isNotEmpty()) {
            item {
                Column {
                    SectionHeader(title = stringResource(R.string.home_section_featured))
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.fillMaxSize().height(((featured.size + 1) / 2 * 240).dp),
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        userScrollEnabled = false,
                    ) {
                        items(featured, key = { it.id }) { p ->
                            ProductCard(
                                product = p,
                                onClick = { onProductClick(p.slug) },
                                onAdd = { onAddToCart(p) },
                                modifier = Modifier.padding(4.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryChip(name: String, onClick: () -> Unit) {
    androidx.compose.material3.Surface(
        onClick = onClick,
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
    Spacer(Modifier.height(0.dp))
}