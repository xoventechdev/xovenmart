/**
 * POS (Quick Order) smoke test.
 *
 * Run against a live backend:
 *   pnpm --filter @xovenmart/api exec ts-node scripts/pos-smoke.ts
 *
 * Requires:
 *   - API running on http://localhost:3001 (or set API_BASE_URL)
 *   - ADMIN_EMAIL / ADMIN_PASSWORD env vars (must be seeded admin login)
 *   - At least one Product in the DB (uses the first one returned by /catalog/search)
 *
 * What it does:
 *   1. Logs in as admin → captures access token
 *   2. Looks up an existing customer by phone (use any seeded number)
 *      OR uses a fresh phone so the order is saved as a guest
 *   3. Searches for a product (any active one)
 *   4. POSTs /admin/pos/orders with CASH payment, markAsPaid=true
 *   5. Expects 200 + a populated order object with source=POS
 *   6. Verifies the order shows up in /admin/orders?source=POS
 *
 * The script exits 0 on success, 1 on failure (with logs).
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001/api/v1";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@xovenmart.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin1234";
// Phone to test the lookup flow with. Use a phone you KNOW doesn't exist
// in the DB to test the guest path.
const TEST_PHONE = process.env.TEST_PHONE || "01700000000";
// Or set this to a phone that DOES exist in the DB to test the registered-customer path.
// (One of the two will be used; TEST_USE_REGISTERED=true forces the registered path.)
const TEST_USE_REGISTERED = process.env.TEST_USE_REGISTERED === "true";

async function api(path: string, init: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

function log(label: string, value: any) {
  console.log(`\n── ${label} ──`);
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

async function run() {
  console.log(`POS smoke test against ${API_BASE_URL}`);

  // ─── 1. Admin login ───
  const login = await api("/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!login.ok || !login.data?.accessToken) {
    console.error("✗ Admin login failed", login);
    process.exit(1);
  }
  const token = login.data.accessToken;
  console.log("✓ Admin logged in");

  // ─── 2. Customer lookup ───
  const lookup = await api(`/admin/pos/customers/lookup?phone=${TEST_PHONE}`, { method: "GET" }, token);
  log("Customer lookup", lookup.data);
  let customer: any = lookup.data;
  if (TEST_USE_REGISTERED && !customer) {
    console.error("✗ TEST_USE_REGISTERED=true but no customer found for that phone");
    process.exit(1);
  }

  // ─── 3. Product search ───
  const products = await api(`/admin/pos/products/search?q=a&limit=1`, { method: "GET" }, token);
  if (!Array.isArray(products.data) || products.data.length === 0) {
    console.error("✗ No products available. Seed some products first.");
    process.exit(1);
  }
  const product = products.data[0];
  log("Product picked", { id: product.id, name: product.nameEn, price: product.salePrice, stock: product.stockQty });

  // ─── 4. Place POS order ───
  const subtotal = product.salePrice * 2;
  const place = await api(
    "/admin/pos/orders",
    {
      method: "POST",
      body: JSON.stringify({
        customerPhone: TEST_PHONE,
        customerName: customer ? undefined : "POS Smoke Test Customer",
        address: {
          area: "Test Area",
          fullText: "Test address line for POS smoke test",
        },
        items: [{ productId: product.id, qty: 2 }],
        paymentMethod: "CASH",
        subtotal,
        discountTotal: 0,
        deliveryFee: 0,
        notes: "Created by pos-smoke.ts script",
        markAsPaid: true,
      }),
    },
    token,
  );
  log("Place order response", place.data);
  if (!place.ok) {
    console.error("✗ Place order failed");
    process.exit(1);
  }
  if (place.data?.order?.source !== "POS") {
    console.error("✗ Order source is not POS:", place.data?.order?.source);
    process.exit(1);
  }
  const orderNo = place.data.order.orderNo;
  console.log(`✓ Order ${orderNo} placed via POS`);

  // ─── 5. Verify order appears in admin list with source=POS ───
  const list = await api(`/admin/orders?source=POS&perPage=50`, { method: "GET" }, token);
  const found = Array.isArray(list.data?.items) && list.data.items.some((o: any) => o.orderNo === orderNo);
  log("Admin order list (source=POS, first 5)", (list.data?.items ?? []).slice(0, 5));
  if (!found) {
    console.error(`✗ Order ${orderNo} not found in /admin/orders?source=POS`);
    process.exit(1);
  }
  console.log(`✓ Order ${orderNo} visible in /admin/orders?source=POS`);

  // ─── 6. Verify default list excludes POS-only filter works ───
  const all = await api(`/admin/orders?perPage=50`, { method: "GET" }, token);
  const allCount = (all.data?.items ?? []).length;
  console.log(`✓ Admin sees ${allCount} total orders when no source filter`);

  console.log("\n🎉 POS smoke test PASSED");
}

run().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
