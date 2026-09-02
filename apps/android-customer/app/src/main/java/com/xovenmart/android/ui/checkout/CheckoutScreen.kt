package com.xovenmart.android.ui.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.Address
import com.xovenmart.android.domain.model.CartItem
import com.xovenmart.android.domain.model.CartPriceQuote

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    onBack: () -> Unit,
    onSuccess: (orderNo: String) -> Unit,
    onAuthRequired: () -> Unit,
    viewModel: CheckoutViewModel = hiltViewModel(),
) {
    val isAuthed by viewModel.isAuthenticated.collectAsState()
    val cart by viewModel.cart.collectAsState()
    val addresses by viewModel.addresses.collectAsState()
    val selectedAddressId by viewModel.selectedAddressId.collectAsState()
    val quote by viewModel.quote.collectAsState()
    val coupon by viewModel.coupon.collectAsState()
    val notes by viewModel.notes.collectAsState()
    val guestName by viewModel.guestName.collectAsState()
    val guestPhone by viewModel.guestPhone.collectAsState()
    val guestContactOk by viewModel.guestContactOk.collectAsState()
    val addressText by viewModel.addressText.collectAsState()
    val area by viewModel.area.collectAsState()
    val landmark by viewModel.landmark.collectAsState()
    val submitting by viewModel.submitting.collectAsState()
    val error by viewModel.error.collectAsState()
    val placedOrderNo by viewModel.placedOrderNo.collectAsState()

    LaunchedEffect(placedOrderNo) {
        placedOrderNo?.let { onSuccess(it) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                title = { Text(stringResource(R.string.checkout_title), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        bottomBar = {
            PlaceOrderFooter(
                quote = quote,
                cart = cart,
                submitting = submitting,
                hasAddress = addressText.isNotBlank() && area.isNotBlank(),
                hasContact = isAuthed || guestContactOk,
                onPlace = viewModel::placeOrder,
            )
        },
    ) { padding ->
        if (cart.items.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = stringResource(R.string.cart_empty),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(vertical = 12.dp, horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    SectionCard(title = "Items") {
                        Column {
                            cart.items.forEachIndexed { idx, item ->
                                CheckoutItemRow(item)
                                if (idx < cart.items.lastIndex) {
                                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                                }
                            }
                        }
                    }
                }

                if (!isAuthed) {
                    item {
                        SectionCard(title = "Contact details") {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = guestName,
                                    onValueChange = viewModel::onGuestNameChange,
                                    label = { Text("Your name") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                OutlinedTextField(
                                    value = guestPhone,
                                    onValueChange = { v -> viewModel.onGuestPhoneChange(v.filter { it.isDigit() }.take(15)) },
                                    label = { Text(stringResource(R.string.auth_field_phone)) },
                                    isError = guestPhone.isNotEmpty() && !guestContactOk,
                                    supportingText = {
                                        if (guestPhone.isNotEmpty() && !guestContactOk) {
                                            Text(
                                                text = stringResource(R.string.auth_error_phone_bd),
                                                color = MaterialTheme.colorScheme.error,
                                            )
                                        } else {
                                            Text(text = stringResource(R.string.auth_helper_phone_bd))
                                        }
                                    },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                TextButton(onClick = onAuthRequired) {
                                    Text("Have an account? Log in")
                                }
                            }
                        }
                    }
                }

                item {
                    SectionCard(title = stringResource(R.string.checkout_address_label)) {
                        if (isAuthed && addresses.isNotEmpty()) {
                            AddressChips(
                                addresses = addresses,
                                selectedId = selectedAddressId,
                                onSelect = viewModel::selectAddress,
                            )
                            Spacer(Modifier.height(12.dp))
                        }
                        AddressForm(
                            area = area, onAreaChange = viewModel::onAreaChange,
                            landmark = landmark, onLandmarkChange = viewModel::onLandmarkChange,
                            fullText = addressText, onFullTextChange = viewModel::onAddressTextChange,
                        )
                    }
                }

                item {
                    SectionCard(title = "Coupon") {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            OutlinedTextField(
                                value = coupon.orEmpty(),
                                onValueChange = viewModel::onCouponChange,
                                singleLine = true,
                                placeholder = { Text("Code") },
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedButton(onClick = viewModel::applyCoupon) { Text("Apply") }
                        }
                        quote?.coupon?.let { c ->
                            Text(
                                text = "Coupon applied: ${c.code}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.tertiary,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                    }
                }

                item {
                    SectionCard(title = "Notes (optional)") {
                        OutlinedTextField(
                            value = notes,
                            onValueChange = viewModel::onNotesChange,
                            placeholder = { Text("Anything our rider should know?") },
                            modifier = Modifier.fillMaxWidth(),
                            maxLines = 3,
                        )
                    }
                }

                item {
                    SectionCard(title = "Order summary") {
                        PriceSummary(quote = quote, fallbackSubtotal = cart.subtotal)
                    }
                }

                if (error != null) {
                    item {
                        Surface(
                            color = MaterialTheme.colorScheme.errorContainer,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = error.orEmpty(),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
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
private fun CheckoutItemRow(item: CartItem) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "${item.qty}×",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(end = 4.dp),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = item.nameEn, style = MaterialTheme.typography.bodyMedium)
            if (item.unit.isNotBlank()) {
                Text(
                    text = item.unit,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(
            text = "৳${(item.unitPrice * item.qty).toInt()}",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun AddressChips(
    addresses: List<Address>,
    selectedId: String?,
    onSelect: (String) -> Unit,
) {
    androidx.compose.foundation.layout.FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        addresses.forEach { a ->
            val isSelected = a.id == selectedId
            AssistChip(
                onClick = { onSelect(a.id) },
                label = { Text(a.label ?: a.area) },
                leadingIcon = if (isSelected) {
                    { Icon(Icons.Filled.Check, contentDescription = null) }
                } else null,
                colors = if (isSelected) {
                    AssistChipDefaults.assistChipColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        labelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                } else AssistChipDefaults.assistChipColors(),
            )
        }
    }
}

@Composable
private fun AddressForm(
    area: String,
    onAreaChange: (String) -> Unit,
    landmark: String,
    onLandmarkChange: (String) -> Unit,
    fullText: String,
    onFullTextChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = area,
            onValueChange = onAreaChange,
            label = { Text("Area / thana") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = landmark,
            onValueChange = onLandmarkChange,
            label = { Text("Landmark (optional)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = fullText,
            onValueChange = onFullTextChange,
            label = { Text("Full address") },
            modifier = Modifier.fillMaxWidth(),
            maxLines = 3,
            placeholder = { Text("House, road, etc.") },
        )
        Text(
            text = "Tip: long-press the location pin in our web app to copy coordinates here.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun PriceSummary(quote: CartPriceQuote?, fallbackSubtotal: Double) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        SummaryRow(label = "Subtotal", value = quote?.subtotal ?: fallbackSubtotal)
        if ((quote?.discountTotal ?: 0.0) > 0) {
            SummaryRow(
                label = "Discount",
                value = -(quote?.discountTotal ?: 0.0),
                color = MaterialTheme.colorScheme.tertiary,
            )
        }
        SummaryRow(label = "Delivery fee", value = quote?.deliveryFee ?: 0.0)
        HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))
        SummaryRow(
            label = "Total",
            value = quote?.grandTotal ?: fallbackSubtotal,
            bold = true,
            color = MaterialTheme.colorScheme.primary,
        )
        if (!quote?.errors.isNullOrEmpty()) {
            Spacer(Modifier.height(8.dp))
            quote!!.errors.forEach {
                Text(
                    text = "• $it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
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
        modifier = Modifier.fillMaxWidth(),
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
private fun PlaceOrderFooter(
    quote: CartPriceQuote?,
    cart: com.xovenmart.android.domain.model.CartState,
    submitting: Boolean,
    hasAddress: Boolean,
    hasContact: Boolean,
    onPlace: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 6.dp,
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = stringResource(R.string.checkout_action_place_order),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "${cart.totalItems} item${if (cart.totalItems == 1) "" else "s"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = "৳${(quote?.grandTotal ?: cart.subtotal).toInt()}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = onPlace,
                enabled = !submitting && hasAddress && hasContact && cart.items.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (submitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(stringResource(R.string.checkout_action_place_order))
                }
            }
        }
    }
}