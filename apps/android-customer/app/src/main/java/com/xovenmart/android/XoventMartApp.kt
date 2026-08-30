package com.xovenmart.android

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Application entry point for the XovenMart customer Android app.
 *
 * Annotated with [HiltAndroidApp] so Hilt can build the dependency graph
 * for the whole process — every `@AndroidEntryPoint`-annotated Activity /
 * Fragment / Compose ViewModel gets its dependencies from this graph.
 */
@HiltAndroidApp
class XovenMartApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Future: Timber / Crashlytics / work-manager init goes here.
        // Kept empty in v1 so the first-run APK stays minimal.
    }
}