package com.xovenmart.android.ui.auth

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

/**
 * Auth subgraph — Login → Register / Forgot / Otp.
 * All five destinations share one [AuthViewModel] scoped to the
 * parent nav graph so the in-progress phone / OTP state survives
 * across screens.
 */
object AuthRoutes {
    const val LOGIN    = "auth/login"
    const val REGISTER = "auth/register"
    const val OTP      = "auth/otp"
    const val FORGOT   = "auth/forgot"
}

@Composable
fun AuthNav(onAuthSuccess: () -> Unit) {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = AuthRoutes.LOGIN) {
        composable(AuthRoutes.LOGIN) {
            LoginScreen(
                onAuthSuccess = onAuthSuccess,
                onNavigateRegister = { nav.navigate(AuthRoutes.REGISTER) },
                onNavigateForgot   = { nav.navigate(AuthRoutes.FORGOT) },
                onNavigateOtp      = { nav.navigate(AuthRoutes.OTP) },
            )
        }
        composable(AuthRoutes.REGISTER) {
            RegisterScreen(
                onAuthSuccess = onAuthSuccess,
                onBack = { nav.popBackStack() },
            )
        }
        composable(AuthRoutes.OTP) {
            OtpScreen(
                onAuthSuccess = onAuthSuccess,
                onBack = { nav.popBackStack() },
            )
        }
        composable(AuthRoutes.FORGOT) {
            ForgotScreen(
                onAuthSuccess = onAuthSuccess,
                onBack = { nav.popBackStack() },
            )
        }
    }
}