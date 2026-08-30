package com.xovenmart.android

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.xovenmart.android.ui.auth.AuthNav
import com.xovenmart.android.ui.auth.AuthViewModel
import com.xovenmart.android.ui.cart.CartScreen
import com.xovenmart.android.ui.category.CategoryScreen
import com.xovenmart.android.ui.checkout.CheckoutScreen
import com.xovenmart.android.ui.checkout.OrderSuccessScreen
import com.xovenmart.android.ui.home.HomeScreen
import com.xovenmart.android.ui.orders.OrderDetailScreen
import com.xovenmart.android.ui.orders.OrdersListScreen
import com.xovenmart.android.ui.product.ProductDetailScreen
import com.xovenmart.android.ui.profile.EditProfileScreen
import com.xovenmart.android.ui.profile.ProfileScreen
import com.xovenmart.android.ui.profile.addresses.AddressFormScreen
import com.xovenmart.android.ui.profile.addresses.AddressesScreen
import com.xovenmart.android.ui.search.SearchScreen
import com.xovenmart.android.ui.track.TrackScreen
import com.xovenmart.android.domain.model.AuthState

/**
 * Top-level navigation graph.
 *
 * Routes are flat strings — we use Navigation-Compose's typed args
 * only where strictly necessary (slugs, orderNo, addressId). The
 * auth gate is implemented by an [AuthViewModel] that observes
 * [AuthState] and pushes the user into the right subgraph on launch
 * / login / logout.
 */
object Routes {
    // Top-level destinations
    const val HOME = "home"
    const val CATEGORY = "category/{slug}"
    const val PRODUCT = "product/{slug}"
    const val SEARCH = "search"
    const val CART = "cart"
    const val CHECKOUT = "checkout"
    const val ORDER_SUCCESS = "checkout/success/{orderNo}"
    const val TRACK = "track?orderNo={orderNo}"

    // Profile / account
    const val PROFILE = "profile"
    const val EDIT_PROFILE = "profile/edit"
    const val ADDRESSES = "profile/addresses"
    const val ADDRESS_FORM = "profile/addresses/form?id={id}"
    const val ORDERS_LIST = "profile/orders"
    const val ORDER_DETAIL = "profile/orders/{id}"

    // Auth
    const val AUTH_GRAPH = "auth"

    fun category(slug: String) = "category/$slug"
    fun product(slug: String) = "product/$slug"
    fun orderSuccess(orderNo: String) = "checkout/success/$orderNo"
    fun track(orderNo: String? = null) =
        if (orderNo == null) "track?orderNo=" else "track?orderNo=$orderNo"
    fun addressForm(id: String? = null) =
        if (id == null) "profile/addresses/form?id=" else "profile/addresses/form?id=$id"
    fun orderDetail(id: String) = "profile/orders/$id"
}

@Composable
fun XovenMartNavGraph(
    navController: NavHostController = rememberNavController(),
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val authState by authViewModel.authState.collectAsState()

    NavHost(
        navController = navController,
        startDestination = if (authState is AuthState.Authenticated) {
            Routes.HOME
        } else {
            // Auth subgraph is the entry for anonymous users too — LoginScreen
            // is its startDestination.
            Routes.AUTH_GRAPH
        },
    ) {
        // ─── Auth subgraph ────────────────────────────────────────────────
        composable(Routes.AUTH_GRAPH) {
            AuthNav(
                onAuthSuccess = {
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.AUTH_GRAPH) { inclusive = true }
                    }
                },
            )
        }

        // ─── Top-level shopper screens ────────────────────────────────────
        composable(Routes.HOME) {
            HomeScreen(
                onCategoryClick = { slug -> navController.navigate(Routes.category(slug)) },
                onProductClick = { slug -> navController.navigate(Routes.product(slug)) },
                onCartClick = { navController.navigate(Routes.CART) },
                onSearchClick = { navController.navigate(Routes.SEARCH) },
                onProfileClick = { navController.navigate(Routes.PROFILE) },
            )
        }

        composable(Routes.CATEGORY) { backStackEntry ->
            val slug = backStackEntry.arguments?.getString("slug").orEmpty()
            CategoryScreen(
                slug = slug,
                onBack = { navController.popBackStack() },
                onProductClick = { s -> navController.navigate(Routes.product(s)) },
                onCartClick = { navController.navigate(Routes.CART) },
            )
        }

        composable(Routes.PRODUCT) { backStackEntry ->
            val slug = backStackEntry.arguments?.getString("slug").orEmpty()
            ProductDetailScreen(
                slug = slug,
                onBack = { navController.popBackStack() },
                onCartClick = { navController.navigate(Routes.CART) },
                onCheckout = { navController.navigate(Routes.CHECKOUT) },
            )
        }

        composable(Routes.SEARCH) {
            SearchScreen(
                onBack = { navController.popBackStack() },
                onProductClick = { s -> navController.navigate(Routes.product(s)) },
                onCartClick = { navController.navigate(Routes.CART) },
            )
        }

        composable(Routes.CART) {
            CartScreen(
                onBack = { navController.popBackStack() },
                onCheckout = {
                    navController.navigate(Routes.CHECKOUT) {
                        launchSingleTop = true
                    }
                },
                onAuthRequired = {
                    navController.navigate(Routes.AUTH_GRAPH)
                },
                onProductClick = { s -> navController.navigate(Routes.product(s)) },
            )
        }

        composable(Routes.CHECKOUT) {
            CheckoutScreen(
                onBack = { navController.popBackStack() },
                onSuccess = { orderNo ->
                    navController.navigate(Routes.orderSuccess(orderNo)) {
                        popUpTo(Routes.HOME) { inclusive = false }
                    }
                },
                onAuthRequired = {
                    navController.navigate(Routes.AUTH_GRAPH)
                },
            )
        }

        composable(Routes.ORDER_SUCCESS) { backStackEntry ->
            val orderNo = backStackEntry.arguments?.getString("orderNo").orEmpty()
            OrderSuccessScreen(
                orderNo = orderNo,
                onTrack = {
                    navController.navigate(Routes.track(orderNo)) {
                        popUpTo(Routes.HOME) { inclusive = false }
                    }
                },
                onContinueShopping = {
                    navController.popBackStack(Routes.HOME, inclusive = false)
                },
            )
        }

        composable(Routes.TRACK) { backStackEntry ->
            val orderNo = backStackEntry.arguments?.getString("orderNo")
            TrackScreen(
                initialOrderNo = orderNo?.takeIf { it.isNotBlank() },
                onBack = { navController.popBackStack() },
            )
        }

        // ─── Profile / account ─────────────────────────────────────────────
        composable(Routes.PROFILE) {
            ProfileScreen(
                onBack = { navController.popBackStack() },
                onEditProfile = { navController.navigate(Routes.EDIT_PROFILE) },
                onAddresses = { navController.navigate(Routes.ADDRESSES) },
                onOrders = { navController.navigate(Routes.ORDERS_LIST) },
                onTrackOrder = { orderNo ->
                    navController.navigate(Routes.track(orderNo))
                },
                onSignedOut = {
                    navController.navigate(Routes.AUTH_GRAPH) {
                        popUpTo(Routes.HOME) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.EDIT_PROFILE) {
            EditProfileScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.ADDRESSES) {
            AddressesScreen(
                onBack = { navController.popBackStack() },
                onAdd = { navController.navigate(Routes.addressForm(null)) },
                onEdit = { id -> navController.navigate(Routes.addressForm(id)) },
            )
        }

        composable(Routes.ADDRESS_FORM) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id")?.takeIf { it.isNotBlank() }
            AddressFormScreen(
                addressId = id,
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.ORDERS_LIST) {
            OrdersListScreen(
                onBack = { navController.popBackStack() },
                onOrderClick = { id -> navController.navigate(Routes.orderDetail(id)) },
            )
        }

        composable(Routes.ORDER_DETAIL) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id").orEmpty()
            OrderDetailScreen(
                orderId = id,
                onBack = { navController.popBackStack() },
                onTrack = { orderNo ->
                    navController.navigate(Routes.track(orderNo))
                },
                onReorderProduct = { slug ->
                    navController.navigate(Routes.product(slug))
                },
            )
        }
    }
}