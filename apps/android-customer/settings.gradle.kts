// Settings for the Android Customer app. Single-module project; multi-module
// split (`:core-network`, `:feature-*`, etc.) is deferred — see plan.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "xovenmart-customer"
include(":app")
