package com.xovenmart.android.ui.profile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xovenmart.android.R
import com.xovenmart.android.domain.model.CustomerProfile
import com.xovenmart.android.domain.model.ReferralOverview
import com.xovenmart.android.ui.common.components.LoadingState
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onEditProfile: () -> Unit,
    onAddresses: () -> Unit,
    onOrders: () -> Unit,
    onTrackOrder: (String) -> Unit,
    onSignedOut: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel(),
) {
    val isSignedIn by viewModel.isSignedIn.collectAsState()
    val profile by viewModel.profile.collectAsState()
    val referral by viewModel.referral.collectAsState()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(isSignedIn) {
        if (!isSignedIn) onSignedOut()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                title = { Text(stringResource(R.string.profile_title), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        if (profile == null) {
            LoadingState(Modifier.padding(padding))
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ProfileHeader(profile = profile!!)
                if (referral != null) {
                    ReferralCard(
                        referral = referral!!,
                        onCopy = {
                            copyToClipboard(context, "Referral code", referral!!.referralCode)
                            scope.launch { snackbarHostState.showSnackbar("Copied to clipboard") }
                        },
                    )
                }
                MenuItem(
                    icon = Icons.Filled.ReceiptLong,
                    title = stringResource(R.string.profile_action_orders),
                    onClick = onOrders,
                )
                MenuItem(
                    icon = Icons.Filled.LocationOn,
                    title = stringResource(R.string.profile_action_addresses),
                    onClick = onAddresses,
                )
                MenuItem(
                    icon = Icons.Filled.Edit,
                    title = stringResource(R.string.profile_action_edit),
                    onClick = onEditProfile,
                )
                MenuItem(
                    icon = Icons.Filled.Logout,
                    title = stringResource(R.string.profile_action_logout),
                    color = MaterialTheme.colorScheme.error,
                    onClick = viewModel::signOut,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Tip: you can also paste a recent order number to track it.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun ProfileHeader(profile: CustomerProfile) {
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                )
            }
            Column {
                Text(
                    text = profile.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Text(
                    text = profile.phone,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                if (!profile.email.isNullOrBlank()) {
                    Text(
                        text = profile.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
        }
    }
}

@Composable
private fun ReferralCard(referral: ReferralOverview, onCopy: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.tertiaryContainer,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Refer & earn",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onTertiaryContainer,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "${referral.stats.totalReferrals} friends joined · ${referral.stats.qualified} qualified",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onTertiaryContainer,
            )
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Your code",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = referral.referralCode,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                IconButton(onClick = onCopy) {
                    Icon(Icons.Filled.ContentCopy, contentDescription = "Copy code")
                }
            }
        }
    }
}

@Composable
private fun MenuItem(
    icon: ImageVector,
    title: String,
    onClick: () -> Unit,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = color)
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = color,
            )
        }
    }
}

private fun copyToClipboard(context: Context, label: String, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    cm?.setPrimaryClip(ClipData.newPlainText(label, text))
}