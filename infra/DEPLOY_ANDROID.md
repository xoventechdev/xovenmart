# Building the Android Customer App

The Android app (`apps/android-customer`) is a native Kotlin/Compose app
for shoppers. It connects to the same backend as the web storefront.

## Sideload workflow (development)

For most users and internal testing, the Android app is **sideloaded**
(APK installed directly from a file), not distributed via the Play Store.
This is simpler and avoids Google's $25 one-time fee + ongoing review burden.

### Build locally

```bash
# Requires JDK 17 + Android SDK (installed by Android Studio Hedgehog or newer)
cd apps/android-customer
./gradlew :app:assembleDebug
# APK appears at: app/build/outputs/apk/debug/app-debug.apk
```

Install on a connected device:
```bash
./gradlew :app:installDebug
```

Or copy the APK to the phone and tap to install (need to allow "Install from
unknown sources" in Android settings).

### Point at your production API

Edit `apps/android-customer/local.properties`:
```properties
sdk.dir=/Users/you/Library/Android/sdk      # (or Windows path)
API_BASE_URL=https://api.yourdomain.com/api/v1/
API_ENV=production
```

Rebuild. The URL is baked into the APK via Gradle's `BuildConfig.API_BASE_URL`.

## CI build (GitHub Actions)

A signed, sideloadable debug APK built on every release tag.

### Add signing (optional but recommended for non-dev testers)

Generate a keystore:
```bash
keytool -genkey -v \
  -keystore xovenmart-release.keystore \
  -alias xovenmart \
  -keyalg RSA -keysize 2048 -validity 10000
```

Upload as GitHub Actions secret via base64:
```bash
base64 -i xovenmart-release.keystore -o keystore.b64
# then paste contents into secret KEYSTORE_BASE64
```

### Add secrets

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | base64-encoded keystore (above) |
| `KEYSTORE_PASSWORD` | the password you used |
| `KEY_ALIAS` | `xovenmart` |
| `KEY_PASSWORD` | key password (often same as keystore password) |

### Trigger a build

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions builds the APK and uploads it as a workflow artifact. Download
from the Actions tab → run → Artifacts → `app-debug.apk` (or `app-release.apk`
if you set up signing).

## Distributing via Play Store (future)

When you're ready:
1. Create a Google Play Console account ($25 one-time)
2. Create an app listing
3. Build a signed AAB (Android App Bundle) instead of APK:
   ```bash
   ./gradlew :app:bundleRelease
   ```
4. Upload the `.aab` to the Play Console

This isn't part of the current setup — sideloading works for v1.

## Manual release checklist

Before tagging a new release:

- [ ] `local.properties` has correct `API_BASE_URL` for the target environment
- [ ] Bump `versionCode` and `versionName` in `apps/android-customer/app/build.gradle.kts`
- [ ] All `TODO` and `FIXME` resolved
- [ ] `./gradlew :app:lintDebug` passes (or only style warnings)
- [ ] Smoke-tested on emulator + at least one physical device
- [ ] Backend can be reached from the device's network (4G/WiFi — test the
      public domain, not localhost)