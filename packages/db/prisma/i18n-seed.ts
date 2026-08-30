// =============================================================================
// XovenMart — i18n translation seed
// Run: pnpm --filter @xovenmart/db exec tsx prisma/i18n-seed.ts
//
// Idempotent. Upserts one row per (key, locale) pair so re-running is safe.
// Keys cover the top customer-facing pages: home, product list, product
// detail, cart, checkout, orders, profile, plus admin shell labels.
//
// Anything not in this list still falls back to the inline t("bn","en")
// calls already in code — these are the seed for the DB-backed layer.
// =============================================================================

import { PrismaClient } from "@prisma/client";

// Load .env from the repo root (or current dir) so DATABASE_URL is available.
// Idiomatic for `tsx prisma/<script>.ts` runs that have no NestJS bootstrap.
import * as fs from "node:fs";
import * as path from "node:path";
function loadEnv() {
  // __dirname is `packages/db/prisma`. Walk up until we find a `.env`.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      const content = fs.readFileSync(candidate, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (m) {
          const key = m[1];
          let val = m[2];
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
      console.log(`[i18n-seed] loaded env from ${candidate}`);
      return;
    }
    dir = path.dirname(dir);
  }
  console.warn("[i18n-seed] no .env found walking up from", __dirname);
}
loadEnv();

const prisma = new PrismaClient();

type Row = { key: string; bn: string; en: string };

const SEED: Row[] = [
  // ── Navigation ────────────────────────────────────────────────────────────
  { key: "nav.home", bn: "হোম", en: "Home" },
  { key: "nav.categories", bn: "ক্যাটাগরি", en: "Categories" },
  { key: "nav.cart", bn: "কার্ট", en: "Cart" },
  { key: "nav.orders", bn: "আমার অর্ডার", en: "My Orders" },
  { key: "nav.profile", bn: "প্রোফাইল", en: "Profile" },
  { key: "nav.signin", bn: "সাইন ইন", en: "Sign In" },
  { key: "nav.signout", bn: "সাইন আউট", en: "Sign Out" },

  // ── Home ──────────────────────────────────────────────────────────────────
  { key: "home.hero_title", bn: "আপনার নিত্যদিনের বাজার, ঘরে বসে", en: "Your daily market, delivered home" },
  { key: "home.hero_subtitle", bn: "তাজা পণ্য, দ্রুত ডেলিভারি", en: "Fresh products, fast delivery" },
  { key: "home.featured", bn: "ফিচার্ড পণ্য", en: "Featured Products" },
  { key: "home.browse_categories", bn: "ক্যাটাগরি দেখুন", en: "Browse Categories" },
  { key: "home.shop_now", bn: "এখনই কিনুন", en: "Shop Now" },
  { key: "why.fast_delivery", bn: "দ্রুত ডে�িভারি", en: "Fast Delivery" },
  { key: "why.fast_delivery_desc", bn: "একই দিনে ডেলিভারি", en: "Same-day delivery" },
  { key: "why.fresh", bn: "তাজা পণ্য", en: "Fresh Products" },
  { key: "why.fresh_desc", bn: "সরাসরি উৎস থে�ে", en: "Directly sourced" },
  { key: "why.secure_payment", bn: "নিরাপদ পেমেন্ট", en: "Secure Payment" },
  { key: "why.secure_payment_desc", bn: "ক্যাশ অন ডেলিভারি", en: "Cash on delivery" },

  // ── Product list / search ─────────────────────────────────────────────────
  { key: "products.results", bn: "{n}টি পণ্য পাওয়া গেছে", en: "{n} products found" },
  { key: "products.sort", bn: "সাজান", en: "Sort" },
  { key: "products.sort.popular", bn: "জনপ্রিয়", en: "Popular" },
  { key: "products.sort.price_low", bn: "মূল্য: কম থেকে বেশি", en: "Price: Low to High" },
  { key: "products.sort.price_high", bn: "মূল্য: বেশি থেকে কম", en: "Price: High to Low" },
  { key: "products.sort.newest", bn: "নতুন আগে", en: "Newest First" },
  { key: "products.filter", bn: "ফিল্টার", en: "Filter" },
  { key: "products.in_stock", bn: "স্টকে আছে", en: "In Stock" },
  { key: "products.out_of_stock", bn: "স্টকে নেই", en: "Out of Stock" },
  { key: "products.add_to_cart", bn: "কার্টে যোগ করুন", en: "Add to Cart" },

  // ── Product detail ────────────────────────────────────────────────────────
  { key: "product.description", bn: "বিবরণ", en: "Description" },
  { key: "product.specifications", bn: "স্পেসিফিকেশন", en: "Specifications" },
  { key: "product.reviews", bn: "রিভি�", en: "Reviews" },
  { key: "product.quantity", bn: "পরিমাণ", en: "Quantity" },
  { key: "product.in_stock_label", bn: "স্টকে আছে", en: "In Stock" },

  // ── Cart ──────────────────────────────────────────────────────────────────
  { key: "cart.title", bn: "আপনার কার্ট", en: "Your Cart" },
  { key: "cart.empty", bn: "কার্ট খালি", en: "Your cart is empty" },
  { key: "cart.empty_desc", bn: "এ�নই কেনাকাটা শুরু করুন", en: "Start shopping now" },
  { key: "cart.continue_shopping", bn: "কেনাকাটা চালিয়ে যান", en: "Continue Shopping" },
  { key: "cart.subtotal", bn: "সাবটোটাল", en: "Subtotal" },
  { key: "cart.delivery", bn: "ডেলিভারি চার্জ", en: "Delivery Fee" },
  { key: "cart.total", bn: "মোট", en: "Total" },
  { key: "cart.proceed_checkout", bn: "চেকআউট করুন", en: "Proceed to Checkout" },

  // ── Checkout ──────────────────────────────────────────────────────────────
  { key: "checkout.title", bn: "চেকআউট", en: "Checkout" },
  { key: "checkout.delivery_location", bn: "ডেলিভারি লোকেশন", en: "Delivery Location" },
  { key: "checkout.select_zone", bn: "ডেলিভারি জোন নির্বাচন করুন", en: "Select a delivery zone" },
  { key: "checkout.choose_location", bn: "ম্যাপে লোকে�ন নির্বাচন করুন", en: "Choose your location on the map" },
  { key: "checkout.address_label", bn: "ঠিকানা", en: "Address" },
  { key: "checkout.address_placeholder", bn: "আপনার পূর্ণ ঠিকানা লিখুন", en: "Type your full address" },
  { key: "checkout.address_required", bn: "সঠিক ঠিকানা লিখুন", en: "Please provide an accurate address" },
  { key: "checkout.phone", bn: "মোবাইল নম্বর", en: "Mobile Number" },
  { key: "checkout.notes", bn: "অতিরিক্ত নোট", en: "Additional notes" },
  { key: "checkout.payment", bn: "পেমেন্ট পদ্ধতি", en: "Payment Method" },
  { key: "checkout.payment_cod", bn: "ক্যাশ অন ডেলিভারি", en: "Cash on Delivery" },
  { key: "checkout.place_order", bn: "অর্ডার নিশ্চিত করুন", en: "Confirm Order" },
  { key: "checkout.order_placed", bn: "অর্ডার সফলভাবে হয়েছে", en: "Order placed successfully" },

  // ── Orders ────────────────────────────────────────────────────────────────
  { key: "orders.title", bn: "আমার অর্ডার", en: "My Orders" },
  { key: "orders.empty", bn: "এখনও কোনো অর্ডার নেই", en: "No orders yet" },
  { key: "orders.status.pending", bn: "পেন্ডিং", en: "Pending" },
  { key: "orders.status.confirmed", bn: "কনফার্�ড", en: "Confirmed" },
  { key: "orders.status.out_for_delivery", bn: "ডেলিভারির জন্য বের হয়েছে", en: "Out for Delivery" },
  { key: "orders.status.delivered", bn: "ডেলিভার্ড", en: "Delivered" },
  { key: "orders.status.cancelled", bn: "বাতিল", en: "Cancelled" },
  { key: "orders.track", bn: "ট্র্যাক করুন", en: "Track Order" },
  { key: "orders.order_id", bn: "অর্ডার আইডি", en: "Order ID" },

  // ── Profile / Auth ────────────────────────────────────────────────────────
  { key: "auth.signin", bn: "সাইন ইন", en: "Sign In" },
  { key: "auth.signup", bn: "সাইন আপ", en: "Sign Up" },
  { key: "auth.phone", bn: "মোবাইল নম্বর", en: "Mobile Number" },
  { key: "auth.otp", bn: "OTP কোড", en: "OTP Code" },
  { key: "auth.send_otp", bn: "OTP পাঠান", en: "Send OTP" },
  { key: "auth.verify", bn: "�াচাই করুন", en: "Verify" },
  { key: "auth.resend", bn: "আবার পাঠান", en: "Resend" },
  { key: "profile.name", bn: "নাম", en: "Name" },
  { key: "profile.phone", bn: "মোবাইল", en: "Mobile" },
  { key: "profile.email", bn: "ইমেইল", en: "Email" },
  { key: "profile.addresses", bn: "ঠিকানা", en: "Addresses" },

  // ── Common ────────────────────────────────────────────────────────────────
  { key: "common.loading", bn: "লোড হচ্ছে…", en: "Loading…" },
  { key: "common.error", bn: "কি�ু সমস্যা হয়েছে", en: "Something went wrong" },
  { key: "common.retry", bn: "আবার চেষ্�া করুন", en: "Retry" },
  { key: "common.cancel", bn: "বাতিল", en: "Cancel" },
  { key: "common.save", bn: "সংরক্ষণ", en: "Save" },
  { key: "common.delete", bn: "মুছে ফেলুন", en: "Delete" },
  { key: "common.edit", bn: "এডিট", en: "Edit" },
  { key: "common.search", bn: "সার্চ করুন", en: "Search" },
  { key: "common.close", bn: "বন্ধ", en: "Close" },
  { key: "common.confirm", bn: "কনফার্ম", en: "Confirm" },
  { key: "common.saved", bn: "সংরক্ষিত হয়েছে", en: "Saved" },
  { key: "common.yes", bn: "হ্যাঁ", en: "Yes" },
  { key: "common.no", bn: "না", en: "No" },
  { key: "common.back", bn: "ফিরে যান", en: "Back" },
  { key: "common.see_all", bn: "সব দেখুন", en: "See All" },
  { key: "common.required", bn: "আবশ্যক", en: "Required" },
  { key: "currency.taka", bn: "৳", en: "৳" },

  // ── Admin shell ───────────────────────────────────────────────────────────
  { key: "admin.title", bn: "অ্যাডমিন প্যানেল", en: "Admin Panel" },
  { key: "admin.dashboard", bn: "ড্যাশবোর্ড", en: "Dashboard" },
  { key: "admin.products", bn: "পণ্য", en: "Products" },
  { key: "admin.categories", bn: "ক্যাটাগরি", en: "Categories" },
  { key: "admin.orders", bn: "অর্ডার", en: "Orders" },
  { key: "admin.customers", bn: "কাস্টমার", en: "Customers" },
  { key: "admin.riders", bn: "রাইডার", en: "Riders" },
  { key: "admin.coupons", bn: "কুপন", en: "Coupons" },
  { key: "admin.delivery_zones", bn: "ডেলিভারি জোন", en: "Delivery Zones" },
  { key: "admin.settings", bn: "সেটিংস", en: "Settings" },
  { key: "admin.translations", bn: "অনুবাদ", en: "Translations" },
];

async function main() {
  console.log(`Seeding ${SEED.length} translation keys…`);
  let upserts = 0;
  // Skip when admin actor doesn't exist (use null updatedBy — it's optional)
  for (const r of SEED) {
    for (const locale of ["bn", "en"] as const) {
      const value = locale === "bn" ? r.bn : r.en;
      await prisma.translation.upsert({
        where: { key_locale: { key: r.key, locale } },
        create: { key: r.key, locale, value, updatedBy: null },
        update: { value, updatedBy: null },
      });
      upserts++;
    }
  }
  console.log(`Done — ${upserts} rows upserted (${SEED.length} keys × 2 locales).`);
  const counts = await Promise.all([
    prisma.translation.count({ where: { locale: "bn" } }),
    prisma.translation.count({ where: { locale: "en" } }),
  ]);
  console.log(`DB totals — bn: ${counts[0]}, en: ${counts[1]}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
