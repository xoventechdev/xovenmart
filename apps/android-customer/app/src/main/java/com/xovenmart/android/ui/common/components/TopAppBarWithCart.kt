package com.xovenmart.android.ui.common.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.xovenmart.android.R

/**
 * TopAppBar shared by Home / Category / Product / Search / Cart etc.
 *
 * Renders:
 *  - optional back arrow (left)
 *  - title (centered)
 *  - optional search icon (right; Home shows it)
 *  - optional profile icon (right; Home shows it, post-login only)
 *  - cart icon with badge showing total items (right; all main screens)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopAppBarWithCart(
    title: String,
    cartItemCount: Int,
    onBack: (() -> Unit)? = null,
    onSearch: (() -> Unit)? = null,
    onProfile: (() -> Unit)? = null,
    onCart: () -> Unit,
) {
    CenterAlignedTopAppBar(
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                }
            }
        },
        actions = {
            if (onSearch != null) {
                IconButton(onClick = onSearch) {
                    Icon(Icons.Filled.Search, contentDescription = "Search")
                }
            }
            if (onProfile != null) {
                IconButton(onClick = onProfile) {
                    Icon(Icons.Filled.Person, contentDescription = "Profile")
                }
            }
            IconButton(onClick = onCart) {
                BadgedBox(
                    badge = {
                        if (cartItemCount > 0) {
                            Badge { Text(cartItemCount.toString()) }
                        }
                    },
                ) {
                    Icon(Icons.Filled.ShoppingCart, contentDescription = stringResource(R.string.cart_title))
                }
            }
        },
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    )
}