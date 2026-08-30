# XovenMart Android Customer App

Native Android client for XovenMart shoppers. Mirrors the user-facing
features of `apps/web` (auth, browse, cart, checkout, tracking, history,
profile, addresses) and talks to the same NestJS backend at
`apps/api` over `/api/v1`.

> **Scope (v1)**: customer-facing flows only. No admin, no rider, no
> management screens. Payment is COD (same as web day-1). Map-based
> address picking uses a text-input geocode (same as web v1).

## Open in Android Studio

1. Install **Android Studio Hedgehog (2023.1)** or newer — its bundled
   JDK 17 satisfies AGP 8.5.
2. **File → Open** → select this directory (`apps/android-customer/`).
   Studio syncs Gradle, downloads deps, indexes.
3. (Optional) Edit `local.properties` if you need to point at a
   non-default backend:

   ```properties
   sdk.dir=/Users/you/Library/Android/sdk
   API_BASE_URL=http://10.0.2.2:3001/api/v1/
   API_ENV=local
   ```

   Defaults work for an emulator pointing at a backend on the same
   host.

## Build & run

```bash
# Build a debug APK
./gradlew :app:assembleDebug

# Install onto a running emulator / connected device
./gradlew :app:installDebug

# Unit tests
./gradlew :app:testDebugUnitTest
```

Debug APK lands at `app/build/outputs/apk/debug/app-debug.apk`.

## Architecture

| Layer | Choice |
|---|---|
| Language | Kotlin 2.0.x |
| UI | Jetpack Compose + Material 3 |
| State | ViewModel + StateFlow |
| DI | Hilt |
| Networking | Retrofit + OkHttp + Kotlinx-Serialization |
| Images | Coil-Compose |
| Tokens | EncryptedSharedPreferences (security-crypto) |
| Prefs | DataStore Preferences |
| Navigation | Navigation-Compose |

Source root: `app/src/main/java/com/xovenmart/android/`
(see `MainActivity.kt`, `XovenMartApp.kt`, `XovenMartNavGraph.kt`,
`core/`, `data/`, `domain/`, `di/`, `ui/`).

## Network

`BuildConfig.API_BASE_URL` is injected from `local.properties`
(falling back to `http://10.0.2.2:3001/api/v1/`). Debug builds allow
cleartext to `10.0.2.2` + LAN ranges via
`res/xml/network_security_config.xml`. Release builds block cleartext
globally.

The base URL must end with a trailing slash so Retrofit resolves
relative paths.

## Auth flow

- Tokens (`access`, `refresh`, audience) are stored in
  `EncryptedSharedPreferences`.
- `AuthInterceptor` adds `Authorization: Bearer …` to every request
  except `auth/customer/refresh`.
- `RefreshAuthenticator` (OkHttp `Authenticator`) handles 401s with a
  single-flight refresh → swap tokens → retry once. On failure, tokens
  are cleared and `AuthState.Anonymous` drives the nav graph back to
  the login subgraph.
- Audience is locked to `customer` for this app.

## Local dev workflow

1. Run the backend: from the monorepo root,
   `pnpm --filter @xovenmart/api dev`.
2. Run the Android emulator (or plug in a device).
3. Build + install: `./gradlew :app:installDebug`.

## Out of scope (v1)

- Push notifications (FCM) — backend has no customer-token registration
  yet.
- Google Maps address picker — v1 uses text-input geocode.
- bKash / Nagad payment — COD only.
- Play Store release, signing, ProGuard/R8 — debug-only.
- Localization (BN) — strings stay English; composables use resource
  IDs so i18n drops in cleanly later.
- Multi-module split — single module for MVP.
- Crash reporting (Crashlytics / Sentry) — Logcat in debug only.

See `/plan` (project root) for the full plan & rationale.