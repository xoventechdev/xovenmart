// Root project build script. Real configuration lives in `:app/build.gradle.kts`
// and `gradle/libs.versions.toml`. We declare the plugins here only so that
// they're available in subprojects without re-declaring versions.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ksp) apply false
}
