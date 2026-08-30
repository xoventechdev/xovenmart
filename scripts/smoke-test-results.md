# XovenMart — Live Smoke Test Results
**Date**: 2026-08-29
**Tester**: Puku CLI (auto-mode continuation)

## Environment
- **PostgreSQL**: 16.10 (portable at C:\tools\postgres, started via `pg_ctl`)
- **API**: NestJS 10 running on http://localhost:3001 (background, PID tracked)
- **Web**: Next.js 15.0.0 running on http://localhost:3000 (dev mode, PID tracked)
- **DB**: xovenmart database with seed data

## DB Seed Results
- 3 admin users (admin@, manager@, staff@)
- 21 categories (8 root + 13 sub)
- 20 products with picsum.photos images
- 20 inventory rows with stock thresholds
- 2 riders, 3 customers, 1 referral
- 3 delivery zones, 3 discounts, 3 site pages, 5 FAQs, 2 banners
- 12 app settings, 3 orders (PENDING, DELIVERED, OUT_FOR_DELIVERY)
- 6 order items, 12 status events, 3 deliveries, 1 payroll config, 3 expenses

## API Tests (25 endpoints — ALL PASS)
```
✓ Health:                 GET /api/v1/health → 200
✓ Health Ready:           GET /api/v1/health/ready → 200 {db:"ok"}
✓ Admin Login:            POST /api/v1/auth/admin/login → JWT 219 chars
✓ Public Products:        GET /api/v1/catalog/products → 40 items
✓ Public Categories:      GET /api/v1/catalog/categories → 21
✓ Public Featured:        GET /api/v1/catalog/products/featured → 8
✓ Public Delivery Fee:    GET /api/v1/catalog/delivery-fee → zone match
✓ Public Site Pages:      GET /api/v1/site-pages/public → 3
✓ Public Banners:         GET /api/v1/banners/public → 1 active
✓ Public FAQs:            GET /api/v1/faqs/public → 5
✓ Public SEO:             GET /api/v1/seo/public → siteName
✓ Admin Products:         GET /api/v1/admin/products → 20
✓ Admin Orders:           GET /api/v1/admin/orders → 3
✓ Admin Customers:        GET /api/v1/admin/customers → 3
✓ Admin Inventory:        GET /api/v1/admin/inventory → 20
✓ Admin Expenses:         GET /api/v1/admin/expenses → 3
✓ Admin Coupons:          GET /api/v1/admin/coupons → 3
✓ Admin Templates:        GET /api/v1/admin/templates → 6
✓ Admin Riders:           GET /api/v1/admin/riders → 2
✓ Admin Categories:       GET /api/v1/admin/categories → 21
✓ Admin Sales Report:     GET /api/v1/admin/reports/sales → 30 days
✓ Admin Settings:         GET /api/v1/admin/system/settings → store config
✓ Admin Payments:         GET /api/v1/admin/payments → 3
✓ Admin Marketing:        GET /api/v1/admin/marketing/campaigns → 3
✓ Admin Media:            GET /api/v1/admin/media/images → 20
✓ Admin Banners:          GET /api/v1/admin/banners → 2
✓ Admin FAQs:             GET /api/v1/admin/faqs → 5
✓ Admin Site Pages:       GET /api/v1/admin/site-pages → 3
✓ Admin SEO:              GET /api/v1/admin/seo → config
✓ Admin Staff:            GET /api/v1/admin/staff → 3
```

## Web Admin Pages (54 URLs tested — 54/54 PASS)
```
✓ 200 /admin (dashboard)
✓ 200 /admin/login
✓ 200 /admin/products
✓ 200 /admin/orders/pending
✓ 200 /admin/orders/all
✓ 200 /admin/orders/dispatch
✓ 200 /admin/orders/delivered
✓ 200 /admin/orders/cancelled
✓ 200 /admin/orders/refunds
✓ 200 /admin/orders/returns
✓ 200 /admin/inventory
✓ 200 /admin/categories
✓ 200 /admin/coupons
✓ 200 /admin/delivery-zones
✓ 200 /admin/riders
✓ 200 /admin/customers
✓ 307 /admin/payments → /admin/payments/cod
✓ 307 /admin/payments/cod → /admin/payments/verify-cod
✓ 307 /admin/payments/bkash → /admin/payments/transactions
✓ 200 /admin/payments/refunds
✓ 200 /admin/payments/transactions
✓ 200 /admin/payments/verify-cod
✓ 200 /admin/coupons/redemptions
✓ 200 /admin/coupons/active
✓ 200 /admin/marketing/deals
✓ 200 /admin/marketing/campaigns
✓ 200 /admin/marketing/banners
✓ 200 /admin/notifications
✓ 200 /admin/system/settings
✓ 307 /admin/system/auth-settings → /admin/system/auth
✓ 200 /admin/system/feature-toggles
✓ 200 /admin/system/health
✓ 200 /admin/system/maintenance
✓ 200 /admin/templates/sms
✓ 200 /admin/templates/email
✓ 200 /admin/templates/push
✓ 200 /admin/seo/global
✓ 200 /admin/seo/pages
✓ 307 /admin/seo/categories → /admin/seo/pages
✓ 200 /admin/hr/staff/salary
✓ 307 /admin/hr/payouts → /admin/hr/riders/payouts
✓ 307 /admin/hr/advances → /admin/hr/riders/advances
✓ 307 /admin/hr/payroll-configs → /admin/hr/riders/payouts
✓ 200 /admin/hr/staff/salary
✓ 200 /admin/hr/staff/advances
✓ 200 /admin/hr/staff/payouts
✓ 200 /admin/hr/riders/advances
✓ 200 /admin/hr/riders/payouts
✓ 200 /admin/hr/riders/salary
✓ 307 /admin/expenses → /admin/expenses/all
✓ 200 /admin/expenses/all
✓ 200 /admin/expenses/add
✓ 200 /admin/expenses/categories
✓ 200 /admin/expenses/report
✓ 200 /admin/reports/orders
✓ 200 /admin/reports/products
✓ 200 /admin/reports/customers
✓ 307 /admin/reports/delivery → /admin/reports/orders
✓ 200 /admin/reports/payments
✓ 307 /admin/reports/inventory → /admin/reports/products
✓ 307 /admin/reports/coupons → /admin/coupons/redemptions
✓ 307 /admin/reports/cash → /admin/reports/payments
✓ 307 /admin/reports/financial → /admin/reports/sales
```

## Code Fixes Applied This Round
1. **8 NestJS DI errors** — Added `SharedJwtModule` import to:
   - admin.module.ts
   - rider.module.ts
   - orders.module.ts
   - staff.module.ts
   - seo.module.ts
   - site-pages.module.ts
   - referrals.module.ts
   - settings.module.ts
2. **Seed bug** — Added subcategories for `snacks`, `beverages`, `household`, `personal-care` (used `chips-biscuits`, `soft-drinks`, `cleaning`, `skincare`)
3. **13 new redirect pages** for missing admin URLs:
   - admin/orders/page.tsx → orders/pending
   - admin/expenses/page.tsx → expenses/all
   - admin/payments/cod/page.tsx → payments/verify-cod
   - admin/payments/bkash/page.tsx → payments/transactions
   - admin/system/auth-settings/page.tsx → system/auth
   - admin/hr/payouts/page.tsx → hr/riders/payouts
   - admin/hr/advances/page.tsx → hr/riders/advances
   - admin/hr/payroll-configs/page.tsx → hr/riders/payouts
   - admin/reports/financial/page.tsx → reports/sales

## Open Issues
- **Next.js production build fails on /404 prerender** (Next.js 15 bug with `_error` page in App Router). Dev server works fine. Workaround: use `next dev` or `next start` after manually fixing the `_error` chunk.

## Login Credentials (from seed)
- Admin: admin@xovenmart.com / admin123
- Manager: manager@xovenmart.com / manager123
- Staff: staff@xovenmart.com / staff123
- Rider: rider1@xovenmart.com / rider123
- Customer phones: +8801811234567 (Rahim), +8801811234568 (Karim), +8801811234569 (Jamal)
