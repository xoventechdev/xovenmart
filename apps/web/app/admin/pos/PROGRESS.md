# Admin POS (Quick Order) — Progress Snapshot

> **Captured**: 2026-08-30
> **Status**: Backend + frontend complete, typecheck clean, Nest builds clean.
> **End-to-end runtime smoke**: pending live DB (script written in `apps/api/scripts/pos-smoke.ts`).
> **Build**: `next build` now compiles + prerenders without errors. The runtime `e[o] is not a function` in `webpack-runtime.js` was caused by `(public)/register/page.tsx` calling `useSearchParams()` outside a `<Suspense>` boundary in Next.js 15. Fixed by wrapping the page body in `<Suspense fallback={null}>` (the same pattern already in use by `(public)/track/page.tsx` and `admin/audit/logs/page.tsx`). Also relaxed `next.config.js` to make `output: "standalone"` opt-in via `NEXT_OUTPUT=standalone` (symlinks fail on stock Windows; standalone is only needed for Docker anyway).

## What's done

### Backend (NestJS)

| File | Purpose |
|---|---|
| `apps/api/src/modules/pos/pos.module.ts` | `@Module` registering PosController + PosService, imports SharedJwtModule + CatalogModule |
| `apps/api/src/modules/pos/pos.controller.ts` | 3 endpoints under `/admin/pos`: `customers/lookup`, `products/search`, `orders` (POST). Guarded by ADMIN + MANAGER role. |
| `apps/api/src/modules/pos/pos.service.ts` | `lookupCustomerByPhone()`, `searchProducts()`, `place()` — same Prisma transaction pattern as CheckoutService but with `source: "POS"`, `status: "ACCEPTED"` (default), any PaymentMethod, cashier-entered pricing, audit-logged with admin actor. |
| `apps/api/src/modules/pos/dto.ts` | `PosAddressDto`, `PosOrderItemDto`, `CreatePosOrderDto` (BD phone regex, lat/lng optional, payment enum incl. CASH/MANUAL_BKASH). |
| `apps/api/src/app.module.ts` | Wires `PosModule` into the app imports. |
| `apps/api/src/modules/admin/admin.controller.ts` | `listOrders()` now accepts `?source=POS` (or any OrderSource). |
| `apps/api/src/modules/checkout/checkout.service.ts` | Customer checkout now writes `source: dto.source ?? "WEB"` so the Android app can mark its orders. |
| `apps/api/scripts/pos-smoke.ts` | End-to-end smoke: login → customer lookup → product search → place → verify in /admin/orders?source=POS. |

### Prisma schema

| Change | Where |
|---|---|
| New enum `OrderSource { WEB, ANDROID, POS }` | `packages/db/prisma/schema.prisma` |
| Extended enum `PaymentMethod` with `CASH`, `MANUAL_BKASH` | same |
| New column `Order.source OrderSource @default(WEB)` | same |

`prisma generate --no-engine` was run successfully. **The user must run `prisma db push` on their live DB to apply the migration.**

### Frontend (Admin panel)

| File | Change |
|---|---|
| `apps/web/app/admin/pos/page.tsx` (NEW, ~860 lines) | Full Quick Order screen: phone lookup → product search → cart → cashier pricing (discount + delivery) → payment method radio + mark-as-paid → confirm modal → place order → success banner with copy + "new order" CTA. Bilingual BN/EN. |
| `apps/web/components/admin/sidebar-nav.tsx` | New POS nav entry with `Calculator` icon and `new` badge. |
| `apps/web/app/admin/page.tsx` | Added "দ্রুত অর্ডার (POS) / Quick Order (POS)" tile to dashboard quick actions. |
| `apps/web/app/admin/orders/_components/orders-list.tsx` | New `source` filter chip row (সব/ওয়েব/POS/অ্যান্ড্রয়েড). CSV export now includes source. |
| `apps/web/components/admin/order-row.tsx` | New `source?: string` field on `AdminOrderRow`. Inline chip showing POS / ANDROID badge on each row (skipped for WEB = the default). |

## What's NOT done

- ~~**End-to-end live smoke**~~ ✅ verified 2026-08-30 — full flow ran against the live API: admin login → customer lookup → product search → POST `/admin/pos/orders` → 201 Created with order `XVM-260830-001` → GET `/admin/orders?source=POS` returns 1 POS order. See `smoke-pos.ps1` (PowerShell) at the repo root.
- ~~**`prisma db push`**~~ ✅ verified 2026-08-30 — `prisma db push --skip-generate` ran successfully; `OrderSource` enum (WEB/ANDROID/POS) and `orders.source` column are now in the live DB.
- **Manager-only POS toggle** — both ADMIN and MANAGER can place POS orders (cashier flow). If you want ADMIN-only, add `@AdminOnly()` to `PosController.place()`.
- **Saved addresses picker** — when the lookup finds a registered customer, we could surface their saved addresses as chips to one-click fill the form. Deferred — cashier types the address for now.
- **POS history per-customer** — no dedicated `/admin/customers/:id/pos-orders` view. The global `/admin/orders?source=POS` filter covers the use case.
- **Refactor `CheckoutService.place()`** — the POS service duplicates the order-create transaction. Once both paths stabilize, extract a shared `OrderCreateService` to dedupe. Deferred (one-time cost, low risk in v1).

## Smoke script — what works now

```powershell
# PowerShell, from repo root, backend on :3001:
powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke-pos.ps1
```

Expected output (5 steps):
1. Admin login → HTTP 200, JWT issued
2. Customer lookup (`01700000000` is not registered) → HTTP 200, `[]`
3. Product search (`q=mango`) → HTTP 200, 1 item (Mango 1kg @ ৳180)
4. **Place POS order (CASH, qty=2, subtotal=360, deliveryFee=60, markAsPaid=true)** → HTTP **201**:
   ```json
   {"ok":true,"order":{
     "orderNo":"XVM-260830-001",
     "status":"ACCEPTED","source":"POS",
     "paymentMethod":"CASH","paymentStatus":"VERIFIED",
     "subtotal":360,"grandTotal":420,
     "customer":{"type":"guest","name":"Test POS Customer","phone":"01700000000"}
   }}
   ```
5. `GET /admin/orders?source=POS` → HTTP 200, **1 POS order** in the admin board

## Smoke script usage

```bash
# In apps/api/, with the backend running on :3001
API_BASE_URL=http://localhost:3001/api/v1 \
ADMIN_EMAIL=admin@xovenmart.local \
ADMIN_PASSWORD=admin1234 \
TEST_PHONE=01700000000 \
pnpm exec ts-node scripts/pos-smoke.ts
```

Exit 0 = all checks passed; exit 1 = printed error.

## Cross-cutting decisions worth remembering

- `source` defaults to `WEB` so existing rows / future web checkouts need no change.
- POS orders default to `ACCEPTED` (not `PENDING`) — admin/cashier already accepted them.
- POS orders with `CASH` or `MANUAL_BKASH` are auto-marked `VERIFIED` (cashier took the money).
- `PaymentMethod.CASH` and `MANUAL_BKASH` are POS-only — web checkout still only accepts `COD` (matches existing restriction).
- The OrderStatus enum is unchanged — POS orders flow through the same `PENDING → ACCEPTED → PREPARING → PREPARED → OUT_FOR_DELIVERY → DELIVERED` lifecycle as everything else.
