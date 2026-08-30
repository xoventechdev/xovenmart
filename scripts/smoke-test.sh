#!/bin/bash
# ============================================================
# XovenMart — Admin API Smoke Test
# Tests every admin endpoint with curl, reports pass/fail
#
# Usage:
#   bash scripts/smoke-test.sh                  # default http://localhost:3001/api/v1
#   bash scripts/smoke-test.sh https://api.xovenmart.com/api/v1
#
# Prerequisites:
#   - API running (pnpm dev:api or docker compose up api)
#   - Database seeded (pnpm db:seed) — creates admin@xovenmart.com / admin123
# ============================================================

set -u
BASE_URL="${1:-http://localhost:3001/api/v1}"

# ── Colors ─────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Counters ───────────────────────────────────────────────────
PASSED=0; FAILED=0; SKIPPED=0
declare -a FAILED_TESTS

# ── Helpers ────────────────────────────────────────────────────
check() {
  local name="$1"; local cmd="$2"; local expected="${3:-200}"
  local status=$(eval "$cmd" -o /tmp/smoke_body.txt -s -w '%{http_code}' 2>/dev/null)
  if [ "$status" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $name ${CYAN}[$status]${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $name ${RED}[expected $expected, got $status]${NC}"
    cat /tmp/smoke_body.txt 2>/dev/null | head -3 | sed 's/^/      /'
    FAILED=$((FAILED + 1))
    FAILED_TESTS+=("$name")
  fi
}

section() {
  echo
  echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

# ── Pre-flight ─────────────────────────────────────────────────
echo -e "${CYAN}▶ XovenMart Admin API Smoke Test${NC}"
echo -e "${CYAN}▶ Base URL: $BASE_URL${NC}"
echo

# Check API is reachable
if ! curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/../docs" 2>/dev/null | grep -q '200\|301'; then
  echo -e "${YELLOW}�  Warning: API may not be reachable at $BASE_URL${NC}"
  echo -e "${YELLOW}  Continuing anyway — tests will report failures if endpoint unreachable.${NC}"
  echo
fi

# ────────────────────────────────────────────────────────────────
# 1. AUTH
# ────────────────────────────────────────────────────────────────
section "1. Authentication"

# Login as admin
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@xovenmart.com","password":"admin123"}')

ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -oP '"accessToken"\s*:\s*"\K[^"]+' || echo "")
if [ -n "$ADMIN_TOKEN" ]; then
  echo -e "  ${GREEN}✓${NC} Admin login successful ${CYAN}[token: ${ADMIN_TOKEN:0:20}...]${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}✗${NC} Admin login failed — response: $LOGIN_RESPONSE"
  FAILED=$((FAILED + 1))
  FAILED_TESTS+=("Admin login")
  echo
  echo -e "${RED}Cannot continue without admin token. Please run 'pnpm db:seed' first.${NC}"
  exit 1
fi

# Login as manager
MGR_LOGIN=$(curl -s -X POST "$BASE_URL/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@xovenmart.com","password":"manager123"}')
MGR_TOKEN=$(echo "$MGR_LOGIN" | grep -oP '"accessToken"\s*:\s*"\K[^"]+' || echo "")
if [ -n "$MGR_TOKEN" ]; then
  echo -e "  ${GREEN}✓${NC} Manager login successful"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}✗${NC} Manager login failed"
  FAILED=$((FAILED + 1))
fi

# Login as rider
RIDER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/rider/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"rider1@xovenmart.com","password":"rider123"}')
RIDER_TOKEN=$(echo "$RIDER_LOGIN" | grep -oP '"accessToken"\s*:\s*"\K[^"]+' || echo "")
if [ -n "$RIDER_TOKEN" ]; then
  echo -e "  ${GREEN}✓${NC} Rider login successful"
  PASSED=$((PASSED + 1))
else
  echo -e "  ${RED}✗${NC} Rider login failed"
  FAILED=$((FAILED + 1))
fi

# /auth/me
check "GET /auth/me (admin)" \
  "curl -s -X GET '$BASE_URL/auth/me' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# Refresh token
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -oP '"refreshToken"\s*:\s*"\K[^"]+' || echo "")
if [ -n "$REFRESH_TOKEN" ]; then
  check "POST /auth/refresh" \
    "curl -s -X POST '$BASE_URL/auth/refresh' -H 'Content-Type: application/json' -H 'Authorization: Bearer $ADMIN_TOKEN' -d '{\"refreshToken\":\"$REFRESH_TOKEN\",\"audience\":\"admin\"}'" 200
fi

# ────────────────────────────────────────────────────────────────
# 2. DASHBOARD
# ────────────────────────────────────────────────────────────────
section "2. Dashboard"

check "GET /admin/stats" \
  "curl -s -X GET '$BASE_URL/admin/stats' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 3. CATEGORIES
# ────────────────────────────────────────────────────────────────
section "3. Categories"

check "GET /admin/categories" \
  "curl -s -X GET '$BASE_URL/admin/categories' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# Get a category ID for later tests
CAT_ID=$(curl -s -X GET "$BASE_URL/admin/categories" -H "Authorization: Bearer $ADMIN_TOKEN" | grep -oP '"id":"[^"]+' | head -1 | cut -d'"' -f4)
echo -e "  ${CYAN}ℹ${NC} Using category ID: $CAT_ID"

# ────────────────────────────────────────────────────────────────
# 4. PRODUCTS
# ────────────────────────────────────────────────────────────────
section "4. Products"

check "GET /admin/products" \
  "curl -s -X GET '$BASE_URL/admin/products' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/products?q=rice" \
  "curl -s -X GET '$BASE_URL/admin/products?q=rice' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# Get a product ID for tests
PROD_ID=$(curl -s -X GET "$BASE_URL/admin/products" -H "Authorization: Bearer $ADMIN_TOKEN" | grep -oP '"id":"[^"]+' | head -1 | cut -d'"' -f4)
echo -e "  ${CYAN}ℹ${NC} Using product ID: $PROD_ID"

check "PATCH /admin/products/:id (toggle isFeatured)" \
  "curl -s -X PATCH '$BASE_URL/admin/products/$PROD_ID' -H 'Content-Type: application/json' -H 'Authorization: Bearer $ADMIN_TOKEN' -d '{\"isFeatured\":true}'" 200

# ────────────────────────────────────────────────────────────────
# 5. INVENTORY
# ────────────────────────────────────────────────────────────────
section "5. Inventory"

check "GET /admin/inventory" \
  "curl -s -X GET '$BASE_URL/admin/inventory' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/inventory/low-stock" \
  "curl -s -X GET '$BASE_URL/admin/inventory/low-stock' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/inventory/movements" \
  "curl -s -X GET '$BASE_URL/admin/inventory/movements' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/inventory/summary" \
  "curl -s -X GET '$BASE_URL/admin/inventory/summary' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 6. CUSTOMERS
# ────────────────────────────────────────────────────────────────
section "6. Customers"

check "GET /admin/customers" \
  "curl -s -X GET '$BASE_URL/admin/customers' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/customers/blocked" \
  "curl -s -X GET '$BASE_URL/admin/customers/blocked' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/customers/referrals" \
  "curl -s -X GET '$BASE_URL/admin/customers/referrals' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/customers/rewards" \
  "curl -s -X GET '$BASE_URL/admin/customers/rewards' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/customers/addresses" \
  "curl -s -X GET '$BASE_URL/admin/customers/addresses' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 7. RIDERS
# ────────────────────────────────────────────────────────────────
section "7. Riders"

check "GET /admin/riders" \
  "curl -s -X GET '$BASE_URL/admin/riders' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/riders/all" \
  "curl -s -X GET '$BASE_URL/admin/riders/all' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/riders/active/list" \
  "curl -s -X GET '$BASE_URL/admin/riders/active/list' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/riders/cash/summary" \
  "curl -s -X GET '$BASE_URL/admin/riders/cash/summary' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 8. ORDERS
# ────────────────────────────────────────────────────────────────
section "8. Orders"

check "GET /admin/orders" \
  "curl -s -X GET '$BASE_URL/admin/orders' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/orders?status=PENDING" \
  "curl -s -X GET '$BASE_URL/admin/orders?status=PENDING' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/orders?statuses=PENDING,PREPARING" \
  "curl -s -X GET '$BASE_URL/admin/orders?statuses=PENDING,PREPARING' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# Get an order ID for detail test
ORDER_ID=$(curl -s -X GET "$BASE_URL/admin/orders" -H "Authorization: Bearer $ADMIN_TOKEN" | grep -oP '"id":"[^"]+' | head -1 | cut -d'"' -f4)
echo -e "  ${CYAN}ℹ${NC} Using order ID: $ORDER_ID"

check "GET /admin/orders/:id" \
  "curl -s -X GET '$BASE_URL/admin/orders/$ORDER_ID' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 9. COUPONS
# ────────────────────────────────────────────────────────────────
section "9. Coupons"

check "GET /admin/coupons" \
  "curl -s -X GET '$BASE_URL/admin/coupons' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/coupons/all" \
  "curl -s -X GET '$BASE_URL/admin/coupons/all' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/coupons/active" \
  "curl -s -X GET '$BASE_URL/admin/coupons/active' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/coupons/redemptions/aggregated" \
  "curl -s -X GET '$BASE_URL/admin/coupons/redemptions/aggregated' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 10. DELIVERY ZONES
# ────────────────────────────────────────────────────────────────
section "10. Delivery Zones"

check "GET /admin/delivery-zones" \
  "curl -s -X GET '$BASE_URL/admin/delivery-zones' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "POST /admin/delivery-zones/recalculate-fees" \
  "curl -s -X POST '$BASE_URL/admin/delivery-zones/recalculate-fees' -H 'Authorization: Bearer $ADMIN_TOKEN' -H 'Content-Type: application/json' -d '{}'" 200

# ────────────────────────────────────────────────────────────────
# 11. CASH SETTLEMENTS
# ────────────────────────────────────────────────────────────────
section "11. Cash Settlements"

check "GET /admin/cash-settlements" \
  "curl -s -X GET '$BASE_URL/admin/cash-settlements' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 12. REPORTS
# ────────────────────────────────────────────────────────────────
section "12. Reports"

check "GET /admin/reports/sales" \
  "curl -s -X GET '$BASE_URL/admin/reports/sales' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/sales/summary" \
  "curl -s -X GET '$BASE_URL/admin/reports/sales/summary' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/orders" \
  "curl -s -X GET '$BASE_URL/admin/reports/orders' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/products/top-selling" \
  "curl -s -X GET '$BASE_URL/admin/reports/products/top-selling' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/customers/top" \
  "curl -s -X GET '$BASE_URL/admin/reports/customers/top' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/riders/performance" \
  "curl -s -X GET '$BASE_URL/admin/reports/riders/performance' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/payments/methods" \
  "curl -s -X GET '$BASE_URL/admin/reports/payments/methods' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/payments/pending" \
  "curl -s -X GET '$BASE_URL/admin/reports/payments/pending' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/reports/referrals" \
  "curl -s -X GET '$BASE_URL/admin/reports/referrals' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 13. SETTINGS / SYSTEM
# ────────────────────────────────────────────────────────────────
section "13. System & Settings"

check "GET /admin/system/settings" \
  "curl -s -X GET '$BASE_URL/admin/system/settings' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/system/feature-toggles" \
  "curl -s -X GET '$BASE_URL/admin/system/feature-toggles' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/system/auth-settings" \
  "curl -s -X GET '$BASE_URL/admin/system/auth-settings' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/system/maintenance" \
  "curl -s -X GET '$BASE_URL/admin/system/maintenance' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/system/health" \
  "curl -s -X GET '$BASE_URL/admin/system/health' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 14. TEMPLATES
# ────────────────────────────────────────────────────────────────
section "14. Templates"

check "GET /admin/templates" \
  "curl -s -X GET '$BASE_URL/admin/templates' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 15. AUDIT
# ────────────────────────────────────────────────────────────────
section "15. Audit Logs"

check "GET /admin/audit/logs" \
  "curl -s -X GET '$BASE_URL/admin/audit/logs' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/audit/admin-actions" \
  "curl -s -X GET '$BASE_URL/admin/audit/admin-actions' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/audit/rider-actions" \
  "curl -s -X GET '$BASE_URL/admin/audit/rider-actions' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 16. HR / PAYROLL
# ────────────────────────────────────────────────────────────────
section "16. HR / Payroll"

check "GET /admin/hr/payouts" \
  "curl -s -X GET '$BASE_URL/admin/hr/payouts' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/hr/advances" \
  "curl -s -X GET '$BASE_URL/admin/hr/advances' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/hr/payroll-configs" \
  "curl -s -X GET '$BASE_URL/admin/hr/payroll-configs' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/hr/staff-salary" \
  "curl -s -X GET '$BASE_URL/admin/hr/staff-salary' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 17. EXPENSES
# ────────────────────────────────────────────────────────────────
section "17. Expenses"

check "GET /admin/expenses" \
  "curl -s -X GET '$BASE_URL/admin/expenses' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/expenses/categories" \
  "curl -s -X GET '$BASE_URL/admin/expenses/categories' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/expenses/summary" \
  "curl -s -X GET '$BASE_URL/admin/expenses/summary' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 18. NOTIFICATIONS
# ────────────────────────────────────────────────────────────────
section "18. Notifications"

check "GET /admin/notifications" \
  "curl -s -X GET '$BASE_URL/admin/notifications' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 19. PAYMENTS
# ────────────────────────────────────────────────────────────────
section "19. Payments"

check "GET /admin/payments" \
  "curl -s -X GET '$BASE_URL/admin/payments' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/payments/pending" \
  "curl -s -X GET '$BASE_URL/admin/payments/pending' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/payments/cod" \
  "curl -s -X GET '$BASE_URL/admin/payments/cod' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/payments/refunds" \
  "curl -s -X GET '$BASE_URL/admin/payments/refunds' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 20. MARKETING
# ────────────────────────────────────────────────────────────────
section "20. Marketing"

check "GET /admin/marketing/banners" \
  "curl -s -X GET '$BASE_URL/admin/marketing/banners' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/marketing/deals" \
  "curl -s -X GET '$BASE_URL/admin/marketing/deals' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/marketing/campaigns" \
  "curl -s -X GET '$BASE_URL/admin/marketing/campaigns' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/marketing/stats" \
  "curl -s -X GET '$BASE_URL/admin/marketing/stats' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 21. SUPPORT
# ────────────────────────────────────────────────────────────────
section "21. Support"

check "GET /admin/support/tickets" \
  "curl -s -X GET '$BASE_URL/admin/support/tickets' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/support/faqs" \
  "curl -s -X GET '$BASE_URL/admin/support/faqs' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 22. MEDIA
# ────────────────────────────────────────────────────────────────
section "22. Media"

check "GET /admin/media/images" \
  "curl -s -X GET '$BASE_URL/admin/media/images' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /admin/media/stats" \
  "curl -s -X GET '$BASE_URL/admin/media/stats' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 23. STAFF / PERMISSIONS
# ────────────────────────────────────────────────────────────────
section "23. Staff & Permissions"

check "GET /staff (list staff)" \
  "curl -s -X GET '$BASE_URL/staff' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /staff/permissions/catalog" \
  "curl -s -X GET '$BASE_URL/staff/permissions/catalog' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 24. SEO
# ────────────────────────────────────────────────────────────────
section "24. SEO"

check "GET /seo/settings" \
  "curl -s -X GET '$BASE_URL/seo/settings' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /seo/sitemap-config" \
  "curl -s -X GET '$BASE_URL/seo/sitemap-config' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 25. PUBLIC PAGES
# ────────────────────────────────────────────────────────────────
section "25. Public Pages / Banners / FAQs"

check "GET /site-pages (list)" \
  "curl -s -X GET '$BASE_URL/site-pages' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /banners (list)" \
  "curl -s -X GET '$BASE_URL/banners' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

check "GET /faqs (list)" \
  "curl -s -X GET '$BASE_URL/faqs' -H 'Authorization: Bearer $ADMIN_TOKEN'" 200

# ────────────────────────────────────────────────────────────────
# 26. PUBLIC CATALOG (no auth required)
# ────────────────────────────────────────────────────────────────
section "26. Public Catalog (no auth)"

check "GET /catalog/categories" \
  "curl -s -X GET '$BASE_URL/catalog/categories'" 200

check "GET /catalog/products" \
  "curl -s -X GET '$BASE_URL/catalog/products'" 200

check "GET /catalog/featured" \
  "curl -s -X GET '$BASE_URL/catalog/featured'" 200

# ────────────────────────────────────────────────────────────────
# 27. AUTH RESTRICTION (manager cannot delete)
# ────────────────────────────────────────────────────────────────
section "27. Role-based Access Control (RBAC)"

# Manager trying to access an @AdminOnly() endpoint should get 403
if [ -n "$MGR_TOKEN" ]; then
  check "Manager DELETE /admin/categories/some-id (should be 403)" \
    "curl -s -X DELETE '$BASE_URL/admin/categories/nonexistent' -H 'Authorization: Bearer $MGR_TOKEN'" 403
fi

# No token at all should be 401
check "No auth GET /admin/stats (should be 401)" \
  "curl -s -X GET '$BASE_URL/admin/stats'" 401

# ────────────────────────────────────────────────────────────────
# SUMMARY
# ────────────────────────────────────────────────────────────────
echo
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  SMOKE TEST SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
TOTAL=$((PASSED + FAILED))
echo -e "  ${GREEN}Passed:${NC}  $PASSED / $TOTAL"
echo -e "  ${RED}Failed:${NC}  $FAILED / $TOTAL"

if [ $FAILED -gt 0 ]; then
  echo
  echo -e "${RED}  Failed tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo -e "    ${RED}•${NC} $t"
  done
  echo
  echo -e "${RED}✗ Smoke test FAILED${NC}"
  exit 1
else
  echo
  echo -e "${GREEN}✓ All endpoints responding correctly!${NC}"
  exit 0
fi
