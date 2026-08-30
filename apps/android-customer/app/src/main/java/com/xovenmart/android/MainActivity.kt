package com.xovenmart.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.xovenmart.android.ui.theme.XovenMartTheme
import dagger.hilt.android.AndroidEntryPoint

/**
 * Single Activity host. Compose owns the whole screen — every screen
 * is a `@Composable` function reachable from [XovenMartNavGraph].
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { XovenMartRoot() }
    }
}

@Composable
private fun XovenMartRoot() {
    XovenMartTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            XovenMartNavGraph()
        }
    }
}