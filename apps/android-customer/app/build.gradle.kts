import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

// Read API_BASE_URL + API_ENV from local.properties (per-developer override),
// falling back to the emulator-friendly default so first-time `gradlew build`
// works without any manual setup.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) load(f.inputStream())
}
val apiBaseUrl: String = (localProps.getProperty("API_BASE_URL")
    ?: System.getenv("API_BASE_URL")
    ?: "http://10.0.2.2:3001/api/v1/").also {
    require(it.endsWith("/")) { "API_BASE_URL must end with a trailing slash so Retrofit resolves relative paths correctly" }
}
val apiEnv: String = (localProps.getProperty("API_ENV") ?: System.getenv("API_ENV") ?: "local")

android {
    namespace = "com.xovenmart.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.xovenmart.android"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true

        // Inject build-config values. Surfaced via `BuildConfig.API_BASE_URL` /
        // `BuildConfig.API_ENV` at runtime so the same source tree can target
        // staging/prod by changing local.properties.
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "API_ENV", "\"$apiEnv\"")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            // Allow cleartext to 10.0.2.2 + LAN IPs — see res/xml/network_security_config.xml.
            buildConfigField("boolean", "ALLOW_CLEARTEXT", "true")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // No signing config in v1; release builds will fail to install
            // without a keystore. Debug APK is what we ship to QA.
            buildConfigField("boolean", "ALLOW_CLEARTEXT", "false")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
        )
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // AndroidX
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.compose)

    // Lifecycle + ViewModel
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Compose BOM — pulls Material3 + UI + tooling at matched versions
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)

    // Persistence
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)

    // Images
    implementation(libs.coil.compose)

    // Tests
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
}
