# Android Customer App — Progress Snapshot

> **Captured**: 2026-08-30
> **Branch state**: feature work paused; admin panel prioritized.
> **Build status**: ✅ `assembleDebug` succeeds; APK packages cleanly.

This file is the real context — read it before resuming Android work.

## What's done (MVP-feature-complete)

All ten tasks #74-#83 are **completed** in the local task tracker. Every screen
called out in the original plan (`glistening-pondering-lamport.md`) has been
implemented and compiles.

### Module / package layout (matches plan)

```
apps/android-customer/
├── README.md, PROGRESS.md, local.properties
├── gradlew, gradle/wrapper/, gradle/libs.versions.toml
└── app/src/main/
    ├── AndroidManifest.xml, res/...
    └── java/com/xovenmart/android/
        ├── XovenMartApp.kt          @HiltAndroidApp
        ├── MainActivity.kt           @AndroidEntryPoint
        ├── XovenMartNavGraph.kt     Routes + NavHost wiring
        ├── core/                     AppDispatchers, BuildConfigBridge
        ├── data/
        │   ├── api/                  7 Retrofit interfaces (Auth, Catalog,
        │   │                         Customer, Orders, Checkout, Referrals, I18n)
        │   ├── dto/                  @Serializable wire-format classes
        │   ├── mapper/               DTO → domain extension functions
        │   ├── local/                SecureTokenStore (EncryptedSharedPreferences),
        │   │                         SessionStore, CartStore (both DataStore)
        │   ├── network/              AuthInterceptor, RefreshAuthenticator
        │   │                         (single-flight Mutex), ErrorAdapter
        │   └── repository/           7 @Singleton repositories
        ├── domain/model/             AuthState, Product, Category, Cart,
        │                             Order, Address, CustomerProfile, etc.
        ├── di/                       NetworkModule, StorageModule, DispatcherModule
        └── ui/
            ├── theme/                XovenMartColors, Typography, Theme
            ├── common/               UiState, LoadingState, ErrorState,
            │                         EmptyState, ProductCard, SectionHeader,
            │                         TopAppBarWithCart
            ├── auth/                 AuthViewModel + AuthNav + Login, Register,
            │                         Otp, Forgot screens
            ├── home/                 HomeViewModel + HomeScreen
            ├── category/             CategoryViewModel + CategoryScreen
            ├── product/              ProductDetailViewModel + ProductDetailScreen
            ├── search/               SearchViewModel + SearchScreen (300ms debounce)
            ├── cart/                 CartViewModel + CartScreen
            ├── checkout/             CheckoutViewModel + CheckoutScreen +
            │                         OrderSuccessScreen
            ├── orders/               OrdersListViewModel + OrdersListScreen +
            │                         OrderDetailViewModel + OrderDetailScreen
            │                         (+ shared StatusChip composable)
            ├── track/                TrackViewModel + TrackScreen
            └── profile/              Profile, EditProfile, Addresses, AddressForm
                                      + matching ViewModels
```

### Nav graph wiring (XovenMartNavGraph.kt)

Every route the plan called out is wired:

| Route | Composable | Notes |
|---|---|---|
| `home` | HomeScreen | categories row + featured grid |
| `category/{slug}` | CategoryScreen | reads `slug` nav arg |
| `product/{slug}` | ProductDetailScreen | reads `slug` nav arg |
| `search` | SearchScreen | debounced input |
| `cart` | CartScreen | onCheckout → checkout; onAuthRequired → auth graph |
| `checkout` | CheckoutScreen | onSuccess(orderNo) → success; onAuthRequired → auth |
| `checkout/success/{orderNo}` | OrderSuccessScreen | onTrack/ContinueShopping |
| `track?orderNo={orderNo}` | TrackScreen | public lookup |
| `profile` | ProfileScreen | onSignedOut → auth graph |
| `profile/edit` | EditProfileScreen | |
| `profile/addresses` | AddressesScreen | add/edit/delete |
| `profile/addresses/form?id={id}` | AddressFormScreen | create or edit |
| `profile/orders` | OrdersListScreen | |
| `profile/orders/{id}` | OrderDetailScreen | onTrack, onReorderProduct |
| `auth` | AuthNav subgraph | Login → Register → Otp → Forgot |

### Auth flow

- `SecureTokenStore` wraps `EncryptedSharedPreferences` (MasterKey AES256_GCM).
- `AuthInterceptor` adds `Authorization: Bearer …` and `X-Audience: customer`
  to every request except `/auth/customer/refresh`.
- `RefreshAuthenticator` uses a `Mutex` for single-flight refresh → swap
  tokens → retry once → on failure, clear tokens so the nav graph bounces
  the user to login.
- Audience is locked to `customer` (single-purpose app).
- Bootstrap state derived from `SecureTokenStore.access()`.

### Cart, checkout, order

- Cart is fully client-side (`CartStore` DataStore, JSON-serialised `CartItem`s,
  dedupes by `productId`).
- Checkout:
  - Loads saved addresses when authenticated, hides them for guests.
  - Guest path requires name + phone.
  - Calls `POST /cart/price` for live quotes.
  - Validates inputs (address, lat/lng, guest fields, server-returned errors).
  - Calls `POST /checkout` → on success, clears the cart and emits
    `placedOrderNo`.
- Order success: copy-to-clipboard, snackbar, "Track order" / "Continue shopping".

### Build

- AGP 8.5.2 + Gradle 8.9 wrapper + Kotlin 2.0.21.
- Compose BOM 2024.09.03, Material 3, Hilt 2.51.1, Retrofit 2.11.0, Coil 2.7.0.
- KSP (not kapt).
- `local.properties` reads `sdk.dir`, `API_BASE_URL`, `API_ENV`; defaults to
  `http://10.0.2.2:3001/api/v1/`.
- Final clean build: **BUILD SUCCESSFUL in 31s**, APK ~20 MB.

### Known compile warnings (non-blocking)

- `Icons.Filled.ArrowBack` deprecated → migrate to
  `Icons.AutoMirrored.Filled.ArrowBack` (5 occurrences across screens).
- `Icons.Filled.ReceiptLong` / `Logout` similar (cosmetic, AutoMirrored
  alternatives exist).
- `inline fun` hints on repository `.toAppResult()` extensions (insignificant
  perf; either accept or convert to private `fun`).

## What's not done / deferred

These were intentionally left out per the plan. None are blockers for the
admin-panel pivot:

1. **Live QA against the running backend** — never actually installed the
   APK on a device. End-to-end smoke script (10 steps in the plan) not
   exercised; some integration assumptions are unvalidated.
2. **Real geolocation in checkout** — CheckoutScreen currently requires
   manual `lat`/`lng` entry from the web map pin copy. No in-app map.
3. **Dark mode visual QA** — Material 3 dynamic color stub exists; never
   tested across screens.
4. **Pull-to-refresh** — not on home/orders/category.
5. **Skeleton loaders** — currently show a centered `LoadingState` circle.
6. **Bengali localization** — strings stay English; resource IDs ready.
7. **bKash / Nagad payment** — COD only (matches web day-1).
8. **Push notifications (FCM)** — backend has no customer-token registration.
9. **Crash reporting** — Logcat only in debug.
10. **Unit tests** — none written. (`RefreshAuthenticator`, `CartStore`,
    and `PriceSummary` were the three the plan called out.)
11. **Multi-module split** — single `:app` module per MVP.
12. **Bottom navigation** — currently a top app bar + back stack. A real
    bottom nav (Home / Categories / Cart / Profile) would be a UX win.
13. **Order "reorder" CTA** in `OrderDetailScreen` jumps to a single
    product detail; ideally it adds all items to cart at once.
14. **Search recent-suggestions chips** — backend returns hits; we don't
    persist recent queries to `SessionStore` yet (the store has the field,
    no UI).

## Resume checklist

When Android work resumes, do these first:

1. `cd apps/android-customer && ./gradlew :app:assembleDebug` — confirm
   the green build still holds.
2. Run `./gradlew :app:installDebug` against the live backend (port 3001)
   and walk through the 10-step smoke script in the plan.
3. Capture screenshot evidence per screen so any UI gaps surface early.
4. Then start on the deferred list above, prioritized as:
   - Real geolocation (huge UX win for checkout)
   - Bottom navigation (UX win for retention)
   - Reorder-all-from-order (small but delightful)
   - Bengali strings (parity with web)
   - Unit tests for the 3 hot spots (cheap insurance)

## Cross-cutting decisions worth remembering

- Wire JSON is camelCase (NestJS default). DTOs do **not** need
  `@SerialName` overrides anywhere.
- `UiState` is a sealed interface with `Loading / Success / Empty / Error`.
  `Empty` is a **data class** (not object) so it can carry a hint.
- `EmptyState` composable takes `title` + optional `body` (NOT `subtitle`).
- `ProfileViewModel` does NOT inject `AuthViewModel` — Hilt refuses
  `@HiltViewModel`-into-`@HiltViewModel`. Instead, it injects
  `SecureTokenStore` directly and mirrors the auth flag itself.
- All status colors live inline in `OrdersListScreen.kt`'s `StatusChip`
  (re-exported) — there is no separate `StatusColors.kt` yet.
- `SharedFlow` collection on `CartStore.state` uses
  `SharingStarted.WhileSubscribed(5_000)` so subscriptions survive rotation
  without re-fetching.
