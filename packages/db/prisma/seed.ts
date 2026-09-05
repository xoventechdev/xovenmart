// =============================================================================
// XovenMart — comprehensive development seed
// Run: pnpm db:seed
//
// Idempotent: safe to run multiple times. Uses upsert where unique keys allow,
// and findFirst/create otherwise.
//
// Creates a realistic snapshot of the e-commerce site so the admin panel can be
// smoke-tested immediately after migrating:
//   • 3 admin users (admin, manager, staff)
//   • 2 riders with cash float
//   • 10 root + 24 sub-categories (Bangla + English) with Unsplash cover images
//   • 50+ products with inventory, stock movement history, real-looking Unsplash photos
//   • 3 delivery zones (Mudaforgonj / Laksam Sadar / Cumilla)
//   • 3 discount coupons (site-wide, flat, category-scoped)
//   • 3 customers with referral chain
//   • 3 orders spanning PENDING / OUT_FOR_DELIVERY / DELIVERED
//   • CMS content (site pages, FAQs, banners)
//   • App settings (store info, currency, feature flags)
//   • Default payroll config + 3 sample expenses
// =============================================================================

import { PrismaClient, Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const TODAY = new Date("2026-08-29T10:00:00Z");
const HOURS = (n: number) => n * 60 * 60 * 1000;
const DAYS = (n: number) => n * 24 * 60 * 60 * 1000;

function rand3(): string {
  return Math.floor(100 + Math.random() * 900).toString();
}

// -----------------------------------------------------------------------------
// Real product photo library
//
// Instead of picsum.photos (which serves random abstract landscapes), we map each
// product slug to a hand-picked Unsplash photo that *looks like* the actual
// grocery item. Unsplash is already whitelisted in apps/web/next.config.js.
//
// Format: append ?w=600&q=80&auto=format&fit=crop for consistent sizing in the
// next/image optimizer. URLs are stable as long as the photo IDs are valid.
// -----------------------------------------------------------------------------

function unsplash(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?w=600&q=80&auto=format&fit=crop`;
}

// Category cover images (square crop — good for category cards / icons)
const CATEGORY_IMAGE: Record<string, string> = {
  // Root categories
  grocery: "1592924357228-91a4daadcfea",
  vegetables: "1540420773420-3366772f4999",
  fruits: "1619566636858-adf3ef46400b",
  dairy: "1559561853-08451507cbe7",
  snacks: "1599490659213-e2b9527bd087",
  beverages: "1544145945-f90425340c7e",
  household: "1583947581924-860bda68d729",
  "personal-care": "1556228720-195a672e8a03",
  // New root
  "fish-meat": "1607623814075-e51df1bdc82f",
  bakery: "1509440159596-0249088772ff",
  // Sub-categories
  rice: "1586201375761-83865001e31c",
  oil: "1474979266404-7eaacbcd87c5",
  spices: "1532336414038-cf19250c5757",
  "fresh-veggies": "1597362925123-77861d3fbac7",
  "leafy-greens": "1576045057995-568f588f82fb",
  "seasonal-fruits": "1619566636858-adf3ef46400b",
  "local-fruits": "1502741338009-cac2772e18bc",
  milk: "1559561853-08451507cbe7",
  yogurt: "1488477181946-6428a0291777",
  "chips-biscuits": "1599490659213-e2b9527bd087",
  "soft-drinks": "1544145945-f90425340c7e",
  cleaning: "1583947581924-860bda68d729",
  skincare: "1556228720-195a672e8a03",
  eggs: "1518569656558-1f25e69d93d7",
  flour: "1568347877321-f8935c7dc5a8",
  salt: "1518110925495-b37653c33df9",
  sugar: "1581613275264-69706c4a1667",
  lentils: "1599909533737-67d8bbf68d1d",
  // New sub-categories
  chicken: "1607623814075-e51df1bdc82f",
  beef: "1607623814075-e51df1bdc82f",
  "fresh-fish": "1544551763-46a013bb70d5",
  bread: "1509440159596-0249088772ff",
  cakes: "1578985545062-69928b1d9587",
  buns: "1555507036-ab1f4038808a",
  "frozen-veg": "1502741338009-cac2772e18bc",
  "ice-cream": "1488900128323-21503983a07e",
  sweets: "1582058091505-f87a2e55a40f",
  noodles: "1623689046286-01d812ca5c20",
  tea: "1571934811356-5cc061b6821f",
};

// Map of product slug → Unsplash photo ID. When the seed sees a known slug it
// uses this photo; otherwise it falls back to a picsum.photos placeholder so
// anything new still has a thumbnail.
const PRODUCT_IMAGE: Record<string, string> = {
  // ---------- Rice / Oil / Spices (grocery staples) ----------
  "premium-basmati-rice-5kg": "1586201375761-83865001e31c",
  "miniket-rice-5kg": "1568347877321-f8935c7dc5a8",
  "nazirshail-rice-5kg": "1626016570302-2c0cefe5d09f",
  "chinigura-rice-2kg": "1574323347407-f5e1ad6d020b",
  "mustard-oil-1l": "1474979266404-7eaacbcd87c5",
  "soybean-oil-2l": "1474979266404-7eaacbcd87c5",
  "olive-oil-500ml": "1474979266404-7eaacbcd87c5",
  "turmeric-powder-200g": "1532336414038-cf19250c5757",
  "red-chili-powder-200g": "1599909533737-67d8bbf68d1d",
  "cumin-powder-100g": "1599909533737-67d8bbf68d1d",
  "coriander-powder-100g": "1599909533737-67d8bbf68d1d",
  "garlic-paste-200g": "1599909533737-67d8bbf68d1d",
  "ginger-paste-200g": "1599909533737-67d8bbf68d1d",
  "salt-1kg": "1518110925495-b37653c33df9",
  "sugar-1kg": "1581613275264-69706c4a1667",
  "moong-dal-1kg": "1599909533737-67d8bbf68d1d",
  "masur-dal-1kg": "1599909533737-67d8bbf68d1d",
  "chana-dal-1kg": "1599909533737-67d8bbf68d1d",
  "flour-atta-2kg": "1568347877321-f8935c7dc5a8",

  // ---------- Fresh veggies ----------
  "potato-1kg": "1597362925123-77861d3fbac7",
  "onion-1kg": "1618512496248-a07fe83aa8cb",
  "tomato-1kg": "1592924357228-91a4daadcfea",
  "carrot-500g": "1582515073490-39981397c445",
  "cucumber-500g": "1604977042946-1eecc6fbe8b6",
  "eggplant-500g": "1605281317010-fe5ffe798166",
  "bitter-gourd-500g": "1605281317010-fe5ffe798166",
  "green-chili-250g": "1583286816038-3b2d2f0e0fa9",
  "ginger-250g": "1606923829579-0cb981a83e2e",
  "garlic-250g": "1615477550927-e7f1d3e7e9d8",
  "cauliflower-1pc": "1566842600175-97dca489844f",
  "cabbage-1pc": "1594282486552-2a0b3d76e5a6",
  "okra-500g": "1576045057995-568f588f82fb",
  "pumpkin-1kg": "1570586437263-ab629fccc818",
  "lemon-4pcs": "1590502593747-42a996133562",

  // ---------- Leafy greens ----------
  "spinach-bunch": "1576045057995-568f588f82fb",
  "coriander-leaves": "1597306544935-71b91a13b6a3",
  "mint-leaves": "1628615253341-44c8e2d2d3e5",
  "lettuce-1head": "1622205313162-1a5718a4e21b",

  // ---------- Fruits ----------
  "mango-1kg": "1553279030-83ba509d006d",
  "banana-1-dozen": "1571771894821-ce9b6c11b08e",
  "local-jackfruit": "1502741338009-cac2772e18bc",
  "pineapple-1pc": "1550828520-4cb496a7c0d6",
  "watermelon-1pc": "1502741224143-90386d7f8c82",
  "papaya-1pc": "1519996529931-28324d5a630e",
  "litchi-500g": "1601493700631-2b16ec4b4716",
  "guava-500g": "1536511132770-e5058c7e53c2",
  "coconut-1pc": "1506979295813-3a5e29e22bd8",
  "pomegranate-1kg": "1541344999716-2a96bb00fbf2",
  "apple-1kg": "1568702846914-96b305d2aaeb",
  "orange-1kg": "1547514701-42782101795e",
  "grapes-500g": "1537640538966-cd3f9a6b29d6",

  // ---------- Dairy ----------
  "pasteurized-milk-1l": "1559561853-08451507cbe7",
  "milk-500ml": "1559561853-08451507cbe7",
  "ghee-500g": "1631452180519-c014fe946bc7",
  "butter-200g": "1559561853-08451507cbe7",
  "cheese-200g": "1486297678162-eb2a19b0a32d",
  "yogurt-500g": "1488477181946-6428a0291777",
  "sweet-yogurt-1kg": "1488477181946-6428a0291777",

  // ---------- Eggs / Bakery ----------
  "eggs-12pcs": "1518569656558-1f25e69d93d7",
  "eggs-30pcs": "1518569656558-1f25e69d93d7",
  "brown-bread": "1509440159596-0249088772ff",
  "white-bread": "1509440159596-0249088772ff",
  "burger-bun-4pcs": "1555507036-ab1f4038808a",
  "chocolate-cake-500g": "1578985545062-69928b1d9587",

  // ---------- Snacks ----------
  "potato-chips-100g": "1599490659213-e2b9527bd087",
  "biscuits-family-pack": "1558961363-fa8fdf82db35",
  "chanachur-300g": "1599490659213-e2b9527bd087",
  "noodles-1pack": "1623689046286-01d812ca5c20",
  "instant-noodles-8pack": "1623689046286-01d812ca5c20",

  // ---------- Beverages ----------
  "mineral-water-1-5l": "1544145945-f90425340c7e",
  "coca-cola-1l": "1544145945-f90425340c7e",
  "sprite-1l": "1544145945-f90425340c7e",
  "orange-juice-1l": "1613478223719-2ab802602423",
  "mango-juice-1l": "1613478223719-2ab802602423",
  "tea-bags-50pcs": "1571934811356-5cc061b6821f",
  "green-tea-25pcs": "1571934811356-5cc061b6821f",

  // ---------- Cleaning ----------
  "toilet-cleaner-500ml": "1583947581924-860bda68d729",
  "dish-wash-liquid-500ml": "1610557892470-55d9e80c0bce",
  "laundry-detergent-1kg": "1610557892470-55d9e80c0bce",
  "floor-cleaner-1l": "1583947581924-860bda68d729",

  // ---------- Personal care ----------
  "bath-soap-4-pack": "1556228720-195a672e8a03",
  "shampoo-200ml": "1556228720-195a672e8a03",
  "hair-oil-200ml": "1556228720-195a672e8a03",
  "toothpaste-150g": "1556228852-80b6e5eeff06",
  "body-lotion-200ml": "1556228578-8c89e6adf883",

  // ---------- Fish / Meat ----------
  "chicken-breast-500g": "1607623814075-e51df1bdc82f",
  "whole-chicken-1kg": "1607623814075-e51df1bdc82f",
  "beef-boneless-500g": "1607623814075-e51df1bdc82f",
  "rohu-fish-500g": "1544551763-46a013bb70d5",
  "hilsa-fish-500g": "1544551763-46a013bb70d5",
  "shrimp-500g": "1544551763-46a013bb70d5",

  // ---------- Frozen ----------
  "frozen-peas-500g": "1502741338009-cac2772e18bc",
  "frozen-mixed-veg-500g": "1502741338009-cac2772e18bc",
  "ice-cream-vanilla-500ml": "1488900128323-21503983a07e",
  "ice-cream-chocolate-500ml": "1488900128323-21503983a07e",

  // ---------- Sweets ----------
  "rasgulla-500g": "1582058091505-f87a2e55a40f",
  "sandesh-500g": "1582058091505-f87a2e55a40f",
  "mishti-doi-300g": "1582058091505-f87a2e55a40f",
};

function referralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

async function upsertAdmin(
  email: string,
  name: string,
  password: string,
  role: "ADMIN" | "MANAGER",
  phone?: string,
  permissions?: Prisma.InputJsonValue,
) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { name, role, isActive: true, permissions: permissions ?? Prisma.DbNull },
    create: {
      email,
      name,
      phone,
      passwordHash,
      role,
      permissions: permissions ?? Prisma.DbNull,
    },
  });
  console.log(`✓ Seeded admin user: ${admin.email}`);
  return admin;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  console.log("🌱 Seeding XovenMart database (comprehensive dev data)...\n");

  const counts = {
    admins: 0,
    categories: 0,
    products: 0,
    inventory: 0,
    productImages: 0,
    riders: 0,
    customers: 0,
    referrals: 0,
    deliveryZones: 0,
    discounts: 0,
    discountCategories: 0,
    sitePages: 0,
    faqs: 0,
    banners: 0,
    appSettings: 0,
    orders: 0,
    orderItems: 0,
    orderStatusEvents: 0,
    deliveries: 0,
    payrollConfigs: 0,
    expenses: 0,
  };

  // ---------------------------------------------------------------------------
  // 1. Admin users
  // ---------------------------------------------------------------------------
  console.log("--- Admin users ---");
  await upsertAdmin(
    "admin@xovenmart.com",
    "Founder Admin",
    "admin123",
    "ADMIN",
    "+8801700000001",
  );
  counts.admins++;
  await upsertAdmin(
    "manager@xovenmart.com",
    "Business Manager",
    "manager123",
    "MANAGER",
    "+8801700000002",
    {
      "products.delete": false,
      "customers.block": false,
      "riders.create": false,
      "riders.settle_cash": false,
      "coupons.update": false,
      "coupons.delete": false,
    },
  );
  counts.admins++;
  await upsertAdmin(
    "staff@xovenmart.com",
    "Store Staff",
    "staff123",
    "MANAGER",
    "+8801700000003",
    {
      "products.delete": false,
      "riders.create": false,
      "coupons.update": false,
      "coupons.delete": false,
      "expenses.delete": false,
    },
  );
  counts.admins++;

  // ---------------------------------------------------------------------------
  // 2. Categories (8 root + 8 sub)
  // ---------------------------------------------------------------------------
  console.log("\n--- Categories ---");
  const rootDefs: Array<{ slug: string; nameBn: string; nameEn: string; sortOrder: number }> = [
    { slug: "grocery", nameBn: "মুদিখানা", nameEn: "Grocery", sortOrder: 1 },
    { slug: "vegetables", nameBn: "সবজি", nameEn: "Vegetables", sortOrder: 2 },
    { slug: "fruits", nameBn: "ফলমূল", nameEn: "Fruits", sortOrder: 3 },
    { slug: "dairy", nameBn: "দুগ্ধজাত", nameEn: "Dairy", sortOrder: 4 },
    { slug: "snacks", nameBn: "স্ন্যাক্স", nameEn: "Snacks", sortOrder: 5 },
    { slug: "beverages", nameBn: "পানীয়", nameEn: "Beverages", sortOrder: 6 },
    { slug: "household", nameBn: "গৃহস্থালি", nameEn: "Household", sortOrder: 7 },
    { slug: "personal-care", nameBn: "ব্যক্তিগত যত্ন", nameEn: "Personal Care", sortOrder: 8 },
    { slug: "fish-meat", nameBn: "মাছ-মাংস", nameEn: "Fish & Meat", sortOrder: 9 },
    { slug: "bakery", nameBn: "বেকারি", nameEn: "Bakery", sortOrder: 10 },
  ];

  const rootCats = new Map<string, { id: string }>();
  for (const r of rootDefs) {
    const imageUrl = unsplash(CATEGORY_IMAGE[r.slug] ?? "1542838132-92c53300491e");
    const cat = await prisma.category.upsert({
      where: { slug: r.slug },
      update: {
        nameBn: r.nameBn,
        nameEn: r.nameEn,
        sortOrder: r.sortOrder,
        parentId: null,
        imageUrl,
      },
      create: { ...r, parentId: null, isActive: true, imageUrl },
    });
    rootCats.set(r.slug, cat);
    counts.categories++;
    console.log(`  ✓ Root: ${r.nameEn}`);
  }

  const subDefs: Array<{ slug: string; nameBn: string; nameEn: string; parent: string; sortOrder: number }> = [
    // Grocery
    { slug: "rice", nameBn: "চাল", nameEn: "Rice", parent: "grocery", sortOrder: 1 },
    { slug: "oil", nameBn: "তেল", nameEn: "Oil", parent: "grocery", sortOrder: 2 },
    { slug: "spices", nameBn: "মসলা", nameEn: "Spices", parent: "grocery", sortOrder: 3 },
    { slug: "lentils", nameBn: "ডাল", nameEn: "Lentils & Pulses", parent: "grocery", sortOrder: 4 },
    { slug: "flour", nameBn: "আটা-ময়দা", nameEn: "Flour", parent: "grocery", sortOrder: 5 },
    { slug: "salt", nameBn: "লবণ", nameEn: "Salt", parent: "grocery", sortOrder: 6 },
    { slug: "sugar", nameBn: "চিনি", nameEn: "Sugar", parent: "grocery", sortOrder: 7 },
    // Vegetables
    { slug: "fresh-veggies", nameBn: "তাজা সবজি", nameEn: "Fresh Veggies", parent: "vegetables", sortOrder: 1 },
    { slug: "leafy-greens", nameBn: "পাতা সবজি", nameEn: "Leafy Greens", parent: "vegetables", sortOrder: 2 },
    // Fruits
    { slug: "seasonal-fruits", nameBn: "মৌসুমী ফল", nameEn: "Seasonal Fruits", parent: "fruits", sortOrder: 1 },
    { slug: "local-fruits", nameBn: "স্থানীয় ফল", nameEn: "Local Fruits", parent: "fruits", sortOrder: 2 },
    // Dairy
    { slug: "milk", nameBn: "দুধ", nameEn: "Milk", parent: "dairy", sortOrder: 1 },
    { slug: "yogurt", nameBn: "দই", nameEn: "Yogurt", parent: "dairy", sortOrder: 2 },
    { slug: "eggs", nameBn: "ডিম", nameEn: "Eggs", parent: "dairy", sortOrder: 3 },
    // Snacks
    { slug: "chips-biscuits", nameBn: "চিপস ও বিস্কুট", nameEn: "Chips & Biscuits", parent: "snacks", sortOrder: 1 },
    { slug: "noodles", nameBn: "নুডলস", nameEn: "Noodles", parent: "snacks", sortOrder: 2 },
    // Beverages
    { slug: "soft-drinks", nameBn: "কোমল পানীয়", nameEn: "Soft Drinks", parent: "beverages", sortOrder: 1 },
    { slug: "tea", nameBn: "চা", nameEn: "Tea", parent: "beverages", sortOrder: 2 },
    // Household
    { slug: "cleaning", nameBn: "পরিষ্কার", nameEn: "Cleaning", parent: "household", sortOrder: 1 },
    // Personal care
    { slug: "skincare", nameBn: "ত্বকের যত্ন", nameEn: "Skincare", parent: "personal-care", sortOrder: 1 },
    // Fish & meat
    { slug: "chicken", nameBn: "মুরগি", nameEn: "Chicken", parent: "fish-meat", sortOrder: 1 },
    { slug: "beef", nameBn: "গরুর মাংস", nameEn: "Beef", parent: "fish-meat", sortOrder: 2 },
    { slug: "fresh-fish", nameBn: "তাজা মাছ", nameEn: "Fresh Fish", parent: "fish-meat", sortOrder: 3 },
    // Bakery
    { slug: "bread", nameBn: "পাউরুটি", nameEn: "Bread", parent: "bakery", sortOrder: 1 },
    { slug: "cakes", nameBn: "কেক", nameEn: "Cakes", parent: "bakery", sortOrder: 2 },
    { slug: "buns", nameBn: "বান", nameEn: "Buns & Rolls", parent: "bakery", sortOrder: 3 },
    { slug: "frozen-veg", nameBn: "ফ্রোজেন সবজি", nameEn: "Frozen Veg", parent: "bakery", sortOrder: 4 },
    { slug: "ice-cream", nameBn: "আইসক্রিম", nameEn: "Ice Cream", parent: "bakery", sortOrder: 5 },
    { slug: "sweets", nameBn: "মিষ্টি", nameEn: "Sweets", parent: "bakery", sortOrder: 6 },
  ];

  const subCats = new Map<string, { id: string }>();
  for (const s of subDefs) {
    const parent = rootCats.get(s.parent);
    if (!parent) throw new Error(`Missing root category ${s.parent}`);
    const imageUrl = unsplash(CATEGORY_IMAGE[s.slug] ?? "1542838132-92c53300491e");
    const cat = await prisma.category.upsert({
      where: { slug: s.slug },
      update: {
        nameBn: s.nameBn,
        nameEn: s.nameEn,
        sortOrder: s.sortOrder,
        parentId: parent.id,
        imageUrl,
      },
      create: {
        slug: s.slug,
        nameBn: s.nameBn,
        nameEn: s.nameEn,
        sortOrder: s.sortOrder,
        parentId: parent.id,
        isActive: true,
        imageUrl,
      },
    });
    subCats.set(s.slug, cat);
    counts.categories++;
    console.log(`  ✓ Sub: ${s.nameEn} (under ${s.parent})`);
  }

  // ---------------------------------------------------------------------------
  // 3. Products + inventory + product image
  // ---------------------------------------------------------------------------
  console.log("\n--- Products ---");
  type ProductSeed = {
    sku: string;
    slug: string;
    nameBn: string;
    nameEn: string;
    descriptionBn: string;
    descriptionEn: string;
    cat: string; // sub-category slug
    unit: "kg" | "pcs" | "L" | "pack";
    mrp: number;
    salePrice: number;
    costPrice: number;
    stockQty: number;
    isFeatured?: boolean;
    isNew?: boolean;
  };

  const productSeeds: ProductSeed[] = [
    {
      sku: `XVM-${rand3()}-basmati-rice-5kg`,
      slug: "premium-basmati-rice-5kg",
      nameBn: "বাসমতি চাল ৫কেজি",
      nameEn: "Premium Basmati Rice 5kg",
      descriptionBn: "উচ্চমানের সুগন্ধি বাসমতি চাল, বিরিয়ানি ও পোলাওয়ের জন্য আদর্শ।",
      descriptionEn: "Premium aromatic basmati rice, perfect for biryani and pulao.",
      cat: "rice",
      unit: "pack",
      mrp: 750,
      salePrice: 650,
      costPrice: 480,
      stockQty: 60,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-miniket-rice-5kg`,
      slug: "miniket-rice-5kg",
      nameBn: "মিনিকেট চাল ৫কেজি",
      nameEn: "Miniket Rice 5kg",
      descriptionBn: "প্রতিদিনের রান্নার জন্য জনপ্রিয় মিনিকেট চাল।",
      descriptionEn: "Popular miniket rice for everyday cooking.",
      cat: "rice",
      unit: "pack",
      mrp: 480,
      salePrice: 420,
      costPrice: 310,
      stockQty: 80,
    },
    {
      sku: `XVM-${rand3()}-mustard-oil-1l`,
      slug: "mustard-oil-1l",
      nameBn: "সরিষার তেল ১ লিটার",
      nameEn: "Mustard Oil 1L",
      descriptionBn: "খাঁটি সরিষার তেল, ঐতিহ্যবাহী স্বাদ।",
      descriptionEn: "Pure mustard oil with traditional flavor.",
      cat: "oil",
      unit: "L",
      mrp: 210,
      salePrice: 180,
      costPrice: 135,
      stockQty: 50,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-soybean-oil-2l`,
      slug: "soybean-oil-2l",
      nameBn: "সয়াবিন তেল ২ লিটার",
      nameEn: "Soybean Oil 2L",
      descriptionBn: "হালকা ও স্বাস্থ্যকর সয়াবিন তেল।",
      descriptionEn: "Light and healthy soybean cooking oil.",
      cat: "oil",
      unit: "L",
      mrp: 360,
      salePrice: 320,
      costPrice: 240,
      stockQty: 40,
    },
    {
      sku: `XVM-${rand3()}-turmeric-200g`,
      slug: "turmeric-powder-200g",
      nameBn: "হলুদ গুঁড়া ২০০ গ্রাম",
      nameEn: "Turmeric Powder 200g",
      descriptionBn: "তাজা ও বিশুদ্ধ হলুদ গুঁড়া।",
      descriptionEn: "Fresh and pure turmeric powder.",
      cat: "spices",
      unit: "pack",
      mrp: 100,
      salePrice: 85,
      costPrice: 58,
      stockQty: 70,
    },
    {
      sku: `XVM-${rand3()}-chili-200g`,
      slug: "red-chili-powder-200g",
      nameBn: "মরিচ গুঁড়া ২০০ গ্রাম",
      nameEn: "Red Chili Powder 200g",
      descriptionBn: "ঝাল মরিচের গুঁড়া, ঐতিহ্যবাহী মশলা।",
      descriptionEn: "Spicy red chili powder, traditional seasoning.",
      cat: "spices",
      unit: "pack",
      mrp: 110,
      salePrice: 95,
      costPrice: 65,
      stockQty: 65,
    },
    {
      sku: `XVM-${rand3()}-potato-1kg`,
      slug: "potato-1kg",
      nameBn: "আলু ১ কেজি",
      nameEn: "Potato 1kg",
      descriptionBn: "তাজা ও পুষ্টিকর আলু।",
      descriptionEn: "Fresh and nutritious potatoes.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 45,
      salePrice: 35,
      costPrice: 24,
      stockQty: 100,
    },
    {
      sku: `XVM-${rand3()}-onion-1kg`,
      slug: "onion-1kg",
      nameBn: "পেঁয়াজ ১ কেজি",
      nameEn: "Onion 1kg",
      descriptionBn: "দেশি পেঁয়াজ, সব রান্নার অপরিহার্য।",
      descriptionEn: "Local onions, essential for every dish.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 70,
      salePrice: 55,
      costPrice: 38,
      stockQty: 90,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-tomato-1kg`,
      slug: "tomato-1kg",
      nameBn: "টমেটো ১ কেজি",
      nameEn: "Tomato 1kg",
      descriptionBn: "পাকা ও টাটকা টমেটো।",
      descriptionEn: "Ripe and fresh tomatoes.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 80,
      salePrice: 60,
      costPrice: 40,
      stockQty: 75,
    },
    {
      sku: `XVM-${rand3()}-spinach-bunch`,
      slug: "spinach-bunch",
      nameBn: "পালং শাক ১ আঁটি",
      nameEn: "Spinach 1 bunch",
      descriptionBn: "তাজা পালং শাক, আয়রনে ভরপুর।",
      descriptionEn: "Fresh spinach bunch, rich in iron.",
      cat: "leafy-greens",
      unit: "pcs",
      mrp: 35,
      salePrice: 25,
      costPrice: 15,
      stockQty: 40,
    },
    {
      sku: `XVM-${rand3()}-mango-1kg`,
      slug: "mango-1kg",
      nameBn: "আম ১ কেজি",
      nameEn: "Mango 1kg",
      descriptionBn: "মিষ্টি ও রসালো মৌসুমী আম।",
      descriptionEn: "Sweet and juicy seasonal mangoes.",
      cat: "seasonal-fruits",
      unit: "kg",
      mrp: 220,
      salePrice: 180,
      costPrice: 130,
      stockQty: 35,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-banana-dozen`,
      slug: "banana-1-dozen",
      nameBn: "কলা ১ ডজন",
      nameEn: "Banana 1 dozen",
      descriptionBn: "পাকা কলা, ডজন হিসেবে।",
      descriptionEn: "Ripe bananas sold by the dozen.",
      cat: "seasonal-fruits",
      unit: "pcs",
      mrp: 80,
      salePrice: 60,
      costPrice: 40,
      stockQty: 50,
    },
    {
      sku: `XVM-${rand3()}-jackfruit`,
      slug: "local-jackfruit",
      nameBn: "কাঁঠাল (স্থানীয়)",
      nameEn: "Local Jackfruit",
      descriptionBn: "মৌসুমী স্থানীয় কাঁঠাল।",
      descriptionEn: "Seasonal local jackfruit.",
      cat: "local-fruits",
      unit: "kg",
      mrp: 100,
      salePrice: 80,
      costPrice: 55,
      stockQty: 20,
    },
    {
      sku: `XVM-${rand3()}-milk-1l`,
      slug: "pasteurized-milk-1l",
      nameBn: "পাস্তুরিত দুধ ১ লিটার",
      nameEn: "Pasteurized Milk 1L",
      descriptionBn: "তাজা পাস্তুরিত দুধ।",
      descriptionEn: "Fresh pasteurized milk.",
      cat: "milk",
      unit: "L",
      mrp: 95,
      salePrice: 85,
      costPrice: 65,
      stockQty: 45,
    },
    {
      sku: `XVM-${rand3()}-yogurt-500g`,
      slug: "yogurt-500g",
      nameBn: "দই ৫০০ গ্রাম",
      nameEn: "Yogurt 500g",
      descriptionBn: "ঘরের তৈরির মতো মিষ্টি দই।",
      descriptionEn: "Sweet yogurt like homemade.",
      cat: "yogurt",
      unit: "pack",
      mrp: 80,
      salePrice: 70,
      costPrice: 50,
      stockQty: 30,
    },
    {
      sku: `XVM-${rand3()}-chips-100g`,
      slug: "potato-chips-100g",
      nameBn: "পটেটো চিপস ১০০ গ্রাম",
      nameEn: "Potato Chips 100g",
      descriptionBn: "ক্রিস্পি আলুর চিপস, স্ন্যাকসের জন্য।",
      descriptionEn: "Crispy potato chips, perfect snack.",
      cat: "chips-biscuits",
      unit: "pack",
      mrp: 40,
      salePrice: 30,
      costPrice: 20,
      stockQty: 100,
    },
    {
      sku: `XVM-${rand3()}-biscuits-family`,
      slug: "biscuits-family-pack",
      nameBn: "বিস্কুট ফ্যামিলি প্যাক",
      nameEn: "Biscuits Family Pack",
      descriptionBn: "পরিবারের জন্য বড় বিস্কুটের প্যাক।",
      descriptionEn: "Large biscuit pack for the family.",
      cat: "chips-biscuits",
      unit: "pack",
      mrp: 150,
      salePrice: 120,
      costPrice: 85,
      stockQty: 55,
    },
    {
      sku: `XVM-${rand3()}-water-1500ml`,
      slug: "mineral-water-1-5l",
      nameBn: "মিনারেল ওয়াটার ১.৫ লিটার",
      nameEn: "Mineral Water 1.5L",
      descriptionBn: "বোতলজাত মিনারেল পানি।",
      descriptionEn: "Bottled mineral water.",
      cat: "soft-drinks",
      unit: "L",
      mrp: 35,
      salePrice: 25,
      costPrice: 15,
      stockQty: 120,
    },
    {
      sku: `XVM-${rand3()}-toilet-cleaner-500`,
      slug: "toilet-cleaner-500ml",
      nameBn: "টয়লেট ক্লিনার ৫০০ মিলি",
      nameEn: "Toilet Cleaner 500ml",
      descriptionBn: "জীবাণুনাশক টয়লেট ক্লিনার।",
      descriptionEn: "Disinfectant toilet cleaner.",
      cat: "cleaning",
      unit: "pack",
      mrp: 120,
      salePrice: 95,
      costPrice: 65,
      stockQty: 40,
      isNew: true,
    },
    {
      sku: `XVM-${rand3()}-soap-4pack`,
      slug: "bath-soap-4-pack",
      nameBn: "গোসলের সাবান ৪ প্যাক",
      nameEn: "Bath Soap 4-pack",
      descriptionBn: "পরিবারের জন্য ৪ প্যাক সাবান।",
      descriptionEn: "Family pack of 4 bath soaps.",
      cat: "skincare",
      unit: "pack",
      mrp: 140,
      salePrice: 110,
      costPrice: 78,
      stockQty: 60,
      isNew: true,
    },

    // ───────────────────────── Grocery: rice + oil + spices + staples ─────────────────────────
    {
      sku: `XVM-${rand3()}-nazirshail-rice`,
      slug: "nazirshail-rice-5kg",
      nameBn: "নাজিরশাইল চাল ৫কেজি",
      nameEn: "Nazirshail Rice 5kg",
      descriptionBn: "সুস্বাদু নাজিরশাইল চাল, দৈনিক রান্নার জন্য চমৎকার।",
      descriptionEn: "Fragrant Nazirshail rice, great for everyday cooking.",
      cat: "rice",
      unit: "pack",
      mrp: 520,
      salePrice: 460,
      costPrice: 340,
      stockQty: 55,
    },
    {
      sku: `XVM-${rand3()}-chinigura-rice`,
      slug: "chinigura-rice-2kg",
      nameBn: "চিনিগুঁড়া চাল ২কেজি",
      nameEn: "Chinigura Rice 2kg",
      descriptionBn: "সুগন্ধি চিনিগুঁড়া চাল, পোলাও ও খিচুড়ির জন্য আদর্শ।",
      descriptionEn: "Aromatic Chinigura rice, perfect for pulao and khichuri.",
      cat: "rice",
      unit: "pack",
      mrp: 320,
      salePrice: 280,
      costPrice: 200,
      stockQty: 45,
    },
    {
      sku: `XVM-${rand3()}-olive-oil`,
      slug: "olive-oil-500ml",
      nameBn: "অলিভ অয়েল ৫০০ মিলি",
      nameEn: "Olive Oil 500ml",
      descriptionBn: "এক্সট্রা ভার্জিন অলিভ অয়েল, সালাদ ও রান্নায় ব্যবহারের জন্য।",
      descriptionEn: "Extra virgin olive oil, ideal for salads and cooking.",
      cat: "oil",
      unit: "L",
      mrp: 850,
      salePrice: 750,
      costPrice: 580,
      stockQty: 25,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-cumin`,
      slug: "cumin-powder-100g",
      nameBn: "জিরা গুঁড়া ১০০ গ্রাম",
      nameEn: "Cumin Powder 100g",
      descriptionBn: "বিশুদ্ধ জিরা গুঁড়া, ভেষজ স্বাদ।",
      descriptionEn: "Pure ground cumin, herbal and earthy.",
      cat: "spices",
      unit: "pack",
      mrp: 80,
      salePrice: 65,
      costPrice: 42,
      stockQty: 60,
    },
    {
      sku: `XVM-${rand3()}-coriander-powder`,
      slug: "coriander-powder-100g",
      nameBn: "ধনে গুঁড়া ১০০ গ্রাম",
      nameEn: "Coriander Powder 100g",
      descriptionBn: "সুগন্ধি ধনে গুঁড়া।",
      descriptionEn: "Fragrant ground coriander.",
      cat: "spices",
      unit: "pack",
      mrp: 70,
      salePrice: 60,
      costPrice: 38,
      stockQty: 55,
    },
    {
      sku: `XVM-${rand3()}-salt`,
      slug: "salt-1kg",
      nameBn: "লবণ ১ কেজি",
      nameEn: "Iodized Salt 1kg",
      descriptionBn: "আয়োডিনযুক্ত লবণ, প্রতিদিনের রান্নার জন্য।",
      descriptionEn: "Iodized salt for daily cooking.",
      cat: "salt",
      unit: "kg",
      mrp: 40,
      salePrice: 32,
      costPrice: 22,
      stockQty: 120,
    },
    {
      sku: `XVM-${rand3()}-sugar`,
      slug: "sugar-1kg",
      nameBn: "চিনি ১ কেজি",
      nameEn: "Sugar 1kg",
      descriptionBn: "বিশুদ্ধ চিনি, চা ও মিষ্টিতে ব্যবহারের জন্য।",
      descriptionEn: "Refined white sugar for tea and sweets.",
      cat: "sugar",
      unit: "kg",
      mrp: 110,
      salePrice: 100,
      costPrice: 80,
      stockQty: 90,
    },
    {
      sku: `XVM-${rand3()}-moong-dal`,
      slug: "moong-dal-1kg",
      nameBn: "মুগ ডাল ১ কেজি",
      nameEn: "Moong Dal 1kg",
      descriptionBn: "উচ্চমানের মুগ ডাল, প্রোটিনে ভরপুর।",
      descriptionEn: "Premium moong dal, rich in protein.",
      cat: "lentils",
      unit: "kg",
      mrp: 180,
      salePrice: 160,
      costPrice: 115,
      stockQty: 65,
    },
    {
      sku: `XVM-${rand3()}-masur-dal`,
      slug: "masur-dal-1kg",
      nameBn: "মসুর ডাল ১ কেজি",
      nameEn: "Masur Dal 1kg",
      descriptionBn: "লাল মসুর ডাল, বাঙালি রান্নার অপরিহার্য।",
      descriptionEn: "Red lentil dal, a Bengali kitchen staple.",
      cat: "lentils",
      unit: "kg",
      mrp: 160,
      salePrice: 140,
      costPrice: 100,
      stockQty: 70,
    },
    {
      sku: `XVM-${rand3()}-chana-dal`,
      slug: "chana-dal-1kg",
      nameBn: "ছোলা ডাল ১ কেজি",
      nameEn: "Chana Dal 1kg",
      descriptionBn: "হলুদ ছোলা ডাল, বিভিন্ন তরকারিতে ব্যবহৃত।",
      descriptionEn: "Split chickpeas, used in many traditional dishes.",
      cat: "lentils",
      unit: "kg",
      mrp: 150,
      salePrice: 135,
      costPrice: 95,
      stockQty: 60,
    },
    {
      sku: `XVM-${rand3()}-atta`,
      slug: "flour-atta-2kg",
      nameBn: "আটা ২ কেজি",
      nameEn: "Wheat Flour Atta 2kg",
      descriptionBn: "তাজা ময়দা আটা, রুটি ও পরোটার জন্য।",
      descriptionEn: "Fresh whole-wheat flour for roti and paratha.",
      cat: "flour",
      unit: "pack",
      mrp: 130,
      salePrice: 115,
      costPrice: 85,
      stockQty: 80,
    },

    // ───────────────────────── Fresh vegetables ─────────────────────────
    {
      sku: `XVM-${rand3()}-carrot`,
      slug: "carrot-500g",
      nameBn: "গাজর ৫০০ গ্রাম",
      nameEn: "Carrot 500g",
      descriptionBn: "লাল-কমলা গাজর, ভিটামিন এ-তে ভরপুর।",
      descriptionEn: "Red-orange carrots, packed with vitamin A.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 60,
      salePrice: 45,
      costPrice: 28,
      stockQty: 50,
    },
    {
      sku: `XVM-${rand3()}-cucumber`,
      slug: "cucumber-500g",
      nameBn: "শসা ৫০০ গ্রাম",
      nameEn: "Cucumber 500g",
      descriptionBn: "সবুজ ও তাজা শসা, সালাদে আদর্শ।",
      descriptionEn: "Crisp green cucumbers, perfect for salad.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 50,
      salePrice: 40,
      costPrice: 22,
      stockQty: 55,
    },
    {
      sku: `XVM-${rand3()}-eggplant`,
      slug: "eggplant-500g",
      nameBn: "বেগুন ৫০০ গ্রাম",
      nameEn: "Eggplant 500g",
      descriptionBn: "বেগুন, বাঙালি তরকারিতে অপরিহার্য।",
      descriptionEn: "Fresh eggplant, essential in Bengali cooking.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 55,
      salePrice: 42,
      costPrice: 25,
      stockQty: 45,
    },
    {
      sku: `XVM-${rand3()}-bitter-gourd`,
      slug: "bitter-gourd-500g",
      nameBn: "করলা ৫০০ গ্রাম",
      nameEn: "Bitter Gourd 500g",
      descriptionBn: "করলা, ডায়াবেটিস নিয়ন্ত্রণে সহায়ক।",
      descriptionEn: "Bitter gourd, known to help control blood sugar.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 70,
      salePrice: 55,
      costPrice: 35,
      stockQty: 30,
    },
    {
      sku: `XVM-${rand3()}-green-chili`,
      slug: "green-chili-250g",
      nameBn: "কাঁচা মরিচ ২৫০ গ্রাম",
      nameEn: "Green Chili 250g",
      descriptionBn: "ঝাঁঝালো কাঁচা মরিচ।",
      descriptionEn: "Spicy fresh green chili peppers.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 60,
      salePrice: 50,
      costPrice: 30,
      stockQty: 50,
    },
    {
      sku: `XVM-${rand3()}-ginger`,
      slug: "ginger-250g",
      nameBn: "আদা ২৫০ গ্রাম",
      nameEn: "Fresh Ginger 250g",
      descriptionBn: "তাজা আদা, মশলা ও চায়ের জন্য।",
      descriptionEn: "Fresh ginger root, great for spice and tea.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 90,
      salePrice: 75,
      costPrice: 50,
      stockQty: 40,
    },
    {
      sku: `XVM-${rand3()}-garlic`,
      slug: "garlic-250g",
      nameBn: "রসুন ২৫০ গ্রাম",
      nameEn: "Fresh Garlic 250g",
      descriptionBn: "খাঁটি দেশি রসুন, তীব্র স্বাদ।",
      descriptionEn: "Local garlic with strong aroma.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 110,
      salePrice: 95,
      costPrice: 65,
      stockQty: 50,
    },
    {
      sku: `XVM-${rand3()}-lemon`,
      slug: "lemon-4pcs",
      nameBn: "লেবু ৪টি",
      nameEn: "Lemon 4pcs",
      descriptionBn: "খাঁটি লেবু, ভিটামিন সি-তে ভরপুর।",
      descriptionEn: "Fresh lemons, full of vitamin C.",
      cat: "fresh-veggies",
      unit: "pcs",
      mrp: 40,
      salePrice: 30,
      costPrice: 18,
      stockQty: 80,
    },
    {
      sku: `XVM-${rand3()}-cauliflower`,
      slug: "cauliflower-1pc",
      nameBn: "ফুলকপি ১টি",
      nameEn: "Cauliflower 1pc",
      descriptionBn: "সাদা ও তাজা ফুলকপি।",
      descriptionEn: "White fresh cauliflower head.",
      cat: "fresh-veggies",
      unit: "pcs",
      mrp: 55,
      salePrice: 45,
      costPrice: 28,
      stockQty: 30,
    },
    {
      sku: `XVM-${rand3()}-cabbage`,
      slug: "cabbage-1pc",
      nameBn: "বাঁধাকপি ১টি",
      nameEn: "Cabbage 1pc",
      descriptionBn: "সবুজ বাঁধাকপি, শীতকালীন সবজি।",
      descriptionEn: "Green cabbage, winter staple.",
      cat: "fresh-veggies",
      unit: "pcs",
      mrp: 45,
      salePrice: 35,
      costPrice: 22,
      stockQty: 35,
    },
    {
      sku: `XVM-${rand3()}-okra`,
      slug: "okra-500g",
      nameBn: "ঢেঁড়স ৫০০ গ্রাম",
      nameEn: "Okra 500g",
      descriptionBn: "তাজা ঢেঁড়স, ভাজি ও তরকারির জন্য।",
      descriptionEn: "Fresh okra for bhorta and curry.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 55,
      salePrice: 42,
      costPrice: 25,
      stockQty: 40,
    },
    {
      sku: `XVM-${rand3()}-pumpkin`,
      slug: "pumpkin-1kg",
      nameBn: "কুমড়া ১ কেজি",
      nameEn: "Pumpkin 1kg",
      descriptionBn: "মিষ্টি কুমড়া, ভিটামিন এ-তে ভরপুর।",
      descriptionEn: "Sweet pumpkin, loaded with vitamin A.",
      cat: "fresh-veggies",
      unit: "kg",
      mrp: 50,
      salePrice: 38,
      costPrice: 22,
      stockQty: 30,
    },

    // ───────────────────────── Leafy greens ─────────────────────────
    {
      sku: `XVM-${rand3()}-coriander-leaves`,
      slug: "coriander-leaves",
      nameBn: "ধনেপাতা ১ আঁটি",
      nameEn: "Coriander Leaves 1 bunch",
      descriptionBn: "সুগন্ধি ধনেপাতা, সালাদ ও গার্নিশের জন্য।",
      descriptionEn: "Aromatic coriander leaves for garnish and salad.",
      cat: "leafy-greens",
      unit: "pcs",
      mrp: 25,
      salePrice: 18,
      costPrice: 10,
      stockQty: 50,
    },
    {
      sku: `XVM-${rand3()}-mint`,
      slug: "mint-leaves",
      nameBn: "পুদিনা পাতা ১ আঁটি",
      nameEn: "Mint Leaves 1 bunch",
      descriptionBn: "তাজা পুদিনা, চা ও চাটনির জন্য।",
      descriptionEn: "Refreshing mint, for tea and chutney.",
      cat: "leafy-greens",
      unit: "pcs",
      mrp: 25,
      salePrice: 20,
      costPrice: 12,
      stockQty: 40,
    },
    {
      sku: `XVM-${rand3()}-lettuce`,
      slug: "lettuce-1head",
      nameBn: "লেটুস ১ মাথা",
      nameEn: "Lettuce 1 head",
      descriptionBn: "ক্রিস্পি লেটুস, সালাদের জন্য।",
      descriptionEn: "Crisp lettuce head, great for salads.",
      cat: "leafy-greens",
      unit: "pcs",
      mrp: 60,
      salePrice: 50,
      costPrice: 30,
      stockQty: 25,
    },

    // ───────────────────────── Fruits ─────────────────────────
    {
      sku: `XVM-${rand3()}-pineapple`,
      slug: "pineapple-1pc",
      nameBn: "আনারস ১টি",
      nameEn: "Pineapple 1pc",
      descriptionBn: "মিষ্টি ও রসালো আনারস।",
      descriptionEn: "Sweet juicy pineapple.",
      cat: "seasonal-fruits",
      unit: "pcs",
      mrp: 80,
      salePrice: 65,
      costPrice: 45,
      stockQty: 20,
      isNew: true,
    },
    {
      sku: `XVM-${rand3()}-watermelon`,
      slug: "watermelon-1pc",
      nameBn: "তরমুজ ১টি",
      nameEn: "Watermelon 1pc",
      descriptionBn: "গ্রীষ্মকালের তৃষ্ণা মেটানো তরমুজ।",
      descriptionEn: "Refreshing summer watermelon.",
      cat: "seasonal-fruits",
      unit: "pcs",
      mrp: 150,
      salePrice: 120,
      costPrice: 85,
      stockQty: 18,
    },
    {
      sku: `XVM-${rand3()}-papaya`,
      slug: "papaya-1pc",
      nameBn: "পেয়ারা ১ কেজি",
      nameEn: "Papaya 1pc",
      descriptionBn: "মিষ্টি পাকা পেয়ারা।",
      descriptionEn: "Sweet ripe papaya.",
      cat: "local-fruits",
      unit: "kg",
      mrp: 80,
      salePrice: 65,
      costPrice: 42,
      stockQty: 20,
    },
    {
      sku: `XVM-${rand3()}-litchi`,
      slug: "litchi-500g",
      nameBn: "লিচু ৫০০ গ্রাম",
      nameEn: "Litchi 500g",
      descriptionBn: "মৌসুমী রসালো লিচু।",
      descriptionEn: "Seasonal juicy litchi.",
      cat: "seasonal-fruits",
      unit: "kg",
      mrp: 250,
      salePrice: 220,
      costPrice: 160,
      stockQty: 15,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-guava`,
      slug: "guava-500g",
      nameBn: "পেয়ারা ৫০০ গ্রাম",
      nameEn: "Guava 500g",
      descriptionBn: "তাজা পেয়ারা, ভিটামিন সি-তে ভরপুর।",
      descriptionEn: "Fresh guava, rich in vitamin C.",
      cat: "local-fruits",
      unit: "kg",
      mrp: 80,
      salePrice: 60,
      costPrice: 38,
      stockQty: 25,
    },
    {
      sku: `XVM-${rand3()}-apple`,
      slug: "apple-1kg",
      nameBn: "আপেল ১ কেজি",
      nameEn: "Apple 1kg",
      descriptionBn: "লাল ক্রিস্পি আপেল।",
      descriptionEn: "Red crisp apples.",
      cat: "seasonal-fruits",
      unit: "kg",
      mrp: 280,
      salePrice: 240,
      costPrice: 180,
      stockQty: 30,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-orange`,
      slug: "orange-1kg",
      nameBn: "কমলা ১ কেজি",
      nameEn: "Orange 1kg",
      descriptionBn: "রসালো মিষ্টি কমলা।",
      descriptionEn: "Juicy sweet oranges.",
      cat: "seasonal-fruits",
      unit: "kg",
      mrp: 220,
      salePrice: 190,
      costPrice: 140,
      stockQty: 35,
    },
    {
      sku: `XVM-${rand3()}-coconut`,
      slug: "coconut-1pc",
      nameBn: "নারকেল ১টি",
      nameEn: "Coconut 1pc",
      descriptionBn: "খাঁটি নারকেল, দই ও মিষ্টি তৈরিতে।",
      descriptionEn: "Fresh coconut for yogurt and sweets.",
      cat: "local-fruits",
      unit: "pcs",
      mrp: 70,
      salePrice: 55,
      costPrice: 35,
      stockQty: 40,
    },

    // ───────────────────────── Dairy ─────────────────────────
    {
      sku: `XVM-${rand3()}-milk-500ml`,
      slug: "milk-500ml",
      nameBn: "দুধ ৫০০ মিলি",
      nameEn: "Fresh Milk 500ml",
      descriptionBn: "ছোট প্যাকে তাজা দুধ।",
      descriptionEn: "Fresh milk in a small pack.",
      cat: "milk",
      unit: "L",
      mrp: 55,
      salePrice: 48,
      costPrice: 35,
      stockQty: 60,
    },
    {
      sku: `XVM-${rand3()}-ghee`,
      slug: "ghee-500g",
      nameBn: "ঘি ৫০০ গ্রাম",
      nameEn: "Pure Ghee 500g",
      descriptionBn: "বিশুদ্ধ ঘি, পোলাও ও মিষ্টি তৈরিতে ব্যবহারের জন্য।",
      descriptionEn: "Pure ghee for pulao and sweets.",
      cat: "milk",
      unit: "pack",
      mrp: 550,
      salePrice: 480,
      costPrice: 380,
      stockQty: 25,
      isFeatured: true,
    },
    {
      sku: `XVM-${rand3()}-butter`,
      slug: "butter-200g",
      nameBn: "মাখন ২০০ গ্রাম",
      nameEn: "Butter 200g",
      descriptionBn: "সল্টেড মাখন, রান্না ও বেকিংয়ের জন্য।",
      descriptionEn: "Salted butter for cooking and baking.",
      cat: "milk",
      unit: "pack",
      mrp: 200,
      salePrice: 175,
      costPrice: 130,
      stockQty: 30,
    },
    {
      sku: `XVM-${rand3()}-cheese`,
      slug: "cheese-200g",
      nameBn: "চিজ ২০০ গ্রাম",
      nameEn: "Cheese 200g",
      descriptionBn: "প্রসেসড চিজ, স্যান্ডউইচ ও পিৎজায়।",
      descriptionEn: "Processed cheese slices for sandwiches and pizza.",
      cat: "milk",
      unit: "pack",
      mrp: 250,
      salePrice: 220,
      costPrice: 165,
      stockQty: 22,
    },
    {
      sku: `XVM-${rand3()}-sweet-yogurt-1kg`,
      slug: "sweet-yogurt-1kg",
      nameBn: "মিষ্টি দই ১ কেজি",
      nameEn: "Sweet Yogurt 1kg",
      descriptionBn: "বড় পাত্রে ঐতিহ্যবাহী মিষ্টি দই।",
      descriptionEn: "Family-size traditional sweet yogurt.",
      cat: "yogurt",
      unit: "pack",
      mrp: 150,
      salePrice: 130,
      costPrice: 95,
      stockQty: 35,
    },
    {
      sku: `XVM-${rand3()}-eggs-12`,
      slug: "eggs-12pcs",
      nameBn: "ডিম ১২টি (সাদা)",
      nameEn: "Eggs 12pcs (white)",
      descriptionBn: "তাজা ফার্মের সাদা ডিম।",
      descriptionEn: "Fresh farm eggs (white).",
      cat: "eggs",
      unit: "pack",
      mrp: 140,
      salePrice: 120,
      costPrice: 88,
      stockQty: 70,
      isFeatured: true,
    },

    // ───────────────────────── Snacks ─────────────────────────
    {
      sku: `XVM-${rand3()}-chanachur`,
      slug: "chanachur-300g",
      nameBn: "চানাচুর ৩০০ গ্রাম",
      nameEn: "Chanachur 300g",
      descriptionBn: "চটপটে চানাচুর, চায়ের সাথে উপভোগ্য।",
      descriptionEn: "Crunchy chanachur mix, perfect with tea.",
      cat: "chips-biscuits",
      unit: "pack",
      mrp: 90,
      salePrice: 75,
      costPrice: 52,
      stockQty: 65,
    },
    {
      sku: `XVM-${rand3()}-noodles`,
      slug: "noodles-1pack",
      nameBn: "নুডলস ১ প্যাক",
      nameEn: "Instant Noodles 1 pack",
      descriptionBn: "স্বাদেভরা তাৎক্ষণিক নুডলস।",
      descriptionEn: "Tasty single-pack instant noodles.",
      cat: "noodles",
      unit: "pack",
      mrp: 30,
      salePrice: 25,
      costPrice: 16,
      stockQty: 100,
    },
    {
      sku: `XVM-${rand3()}-noodles-8`,
      slug: "instant-noodles-8pack",
      nameBn: "নুডলস ৮ প্যাক",
      nameEn: "Instant Noodles 8-pack",
      descriptionBn: "পরিবারের জন্য ৮ প্যাক ইনস্ট্যান্ট নুডলস।",
      descriptionEn: "Family pack of 8 instant noodles.",
      cat: "noodles",
      unit: "pack",
      mrp: 220,
      salePrice: 190,
      costPrice: 145,
      stockQty: 40,
    },

    // ───────────────────────── Beverages ─────────────────────────
    {
      sku: `XVM-${rand3()}-coca-cola`,
      slug: "coca-cola-1l",
      nameBn: "কোকাকোলা ১ লিটার",
      nameEn: "Coca-Cola 1L",
      descriptionBn: "বোতলজাত কোকাকোলা, ঠান্ডা পানীয়।",
      descriptionEn: "Bottled Coca-Cola soft drink.",
      cat: "soft-drinks",
      unit: "L",
      mrp: 75,
      salePrice: 65,
      costPrice: 45,
      stockQty: 60,
    },
    {
      sku: `XVM-${rand3()}-sprite`,
      slug: "sprite-1l",
      nameBn: "স্প্রাইট ১ লিটার",
      nameEn: "Sprite 1L",
      descriptionBn: "লেবু-লাইম স্বাদের স্প্রাইট।",
      descriptionEn: "Lemon-lime flavored Sprite.",
      cat: "soft-drinks",
      unit: "L",
      mrp: 75,
      salePrice: 65,
      costPrice: 45,
      stockQty: 55,
    },
    {
      sku: `XVM-${rand3()}-orange-juice`,
      slug: "orange-juice-1l",
      nameBn: "কমলার জুস ১ লিটার",
      nameEn: "Orange Juice 1L",
      descriptionBn: "প্রাকৃতিক কমলার রস।",
      descriptionEn: "Natural orange juice.",
      cat: "soft-drinks",
      unit: "L",
      mrp: 180,
      salePrice: 160,
      costPrice: 120,
      stockQty: 30,
    },
    {
      sku: `XVM-${rand3()}-mango-juice`,
      slug: "mango-juice-1l",
      nameBn: "আমের জুস ১ লিটার",
      nameEn: "Mango Juice 1L",
      descriptionBn: "আমের ঘন জুস।",
      descriptionEn: "Concentrated mango juice.",
      cat: "soft-drinks",
      unit: "L",
      mrp: 200,
      salePrice: 175,
      costPrice: 130,
      stockQty: 25,
    },
    {
      sku: `XVM-${rand3()}-tea-bags`,
      slug: "tea-bags-50pcs",
      nameBn: "চায়ের ব্যাগ ৫০ পিস",
      nameEn: "Tea Bags 50pcs",
      descriptionBn: "ব্র্যান্ডেড চায়ের ব্যাগ, সকালের চায়ের জন্য।",
      descriptionEn: "Premium tea bags, perfect for morning tea.",
      cat: "tea",
      unit: "pack",
      mrp: 160,
      salePrice: 140,
      costPrice: 100,
      stockQty: 45,
    },

    // ───────────────────────── Cleaning ─────────────────────────
    {
      sku: `XVM-${rand3()}-dish-wash`,
      slug: "dish-wash-liquid-500ml",
      nameBn: "ডিশ ওয়াশ লিকুইড ৫০০ মিলি",
      nameEn: "Dish Wash Liquid 500ml",
      descriptionBn: "তেল-প্রতিরোধী ডিশ ওয়াশ লিকুইড।",
      descriptionEn: "Grease-cutting dish wash liquid.",
      cat: "cleaning",
      unit: "pack",
      mrp: 130,
      salePrice: 110,
      costPrice: 78,
      stockQty: 50,
    },
    {
      sku: `XVM-${rand3()}-laundry-detergent`,
      slug: "laundry-detergent-1kg",
      nameBn: "লন্ড্রি ডিটারজেন্ট ১ কেজি",
      nameEn: "Laundry Detergent 1kg",
      descriptionBn: "দাগ-প্রতিরোধী লন্ড্রি পাউডার।",
      descriptionEn: "Stain-fighting laundry powder.",
      cat: "cleaning",
      unit: "kg",
      mrp: 220,
      salePrice: 195,
      costPrice: 150,
      stockQty: 40,
    },

    // ───────────────────────── Personal care ─────────────────────────
    {
      sku: `XVM-${rand3()}-shampoo`,
      slug: "shampoo-200ml",
      nameBn: "শ্যাম্পু ২০০ মিলি",
      nameEn: "Shampoo 200ml",
      descriptionBn: "নরম ও মসৃণ চুলের জন্য শ্যাম্পু।",
      descriptionEn: "Gentle shampoo for soft, smooth hair.",
      cat: "skincare",
      unit: "pack",
      mrp: 180,
      salePrice: 155,
      costPrice: 110,
      stockQty: 40,
    },
    {
      sku: `XVM-${rand3()}-hair-oil`,
      slug: "hair-oil-200ml",
      nameBn: "চুলের তেল ২০০ মিলি",
      nameEn: "Hair Oil 200ml",
      descriptionBn: "পুষ্টিকর চুলের তেল।",
      descriptionEn: "Nourishing hair oil.",
      cat: "skincare",
      unit: "pack",
      mrp: 160,
      salePrice: 135,
      costPrice: 95,
      stockQty: 35,
    },
    {
      sku: `XVM-${rand3()}-toothpaste`,
      slug: "toothpaste-150g",
      nameBn: "টুথপেস্ট ১৫০ গ্রাম",
      nameEn: "Toothpaste 150g",
      descriptionBn: "ফ্লোরাইড টুথপেস্ট, তাজা শ্বাসের জন্য।",
      descriptionEn: "Fluoride toothpaste for fresh breath.",
      cat: "skincare",
      unit: "pack",
      mrp: 130,
      salePrice: 110,
      costPrice: 78,
      stockQty: 50,
    },

    // ───────────────────────── Fish & meat ─────────────────────────
    {
      sku: `XVM-${rand3()}-chicken-breast`,
      slug: "chicken-breast-500g",
      nameBn: "চিকেন ব্রেস্ট ৫০০ গ্রাম",
      nameEn: "Chicken Breast 500g",
      descriptionBn: "বোনলেস চিকেন ব্রেস্ট, প্রোটিনে ভরপুর।",
      descriptionEn: "Boneless chicken breast, high in protein.",
      cat: "chicken",
      unit: "kg",
      mrp: 320,
      salePrice: 280,
      costPrice: 210,
      stockQty: 25,
    },
    {
      sku: `XVM-${rand3()}-whole-chicken`,
      slug: "whole-chicken-1kg",
      nameBn: "পুরো মুরগি ১ কেজি",
      nameEn: "Whole Chicken 1kg",
      descriptionBn: "তাজা পুরো মুরগি, স্টু ও রোস্টের জন্য।",
      descriptionEn: "Fresh whole chicken for stew and roast.",
      cat: "chicken",
      unit: "kg",
      mrp: 280,
      salePrice: 240,
      costPrice: 180,
      stockQty: 20,
    },
    {
      sku: `XVM-${rand3()}-rohu-fish`,
      slug: "rohu-fish-500g",
      nameBn: "রুই মাছ ৫০০ গ্রাম",
      nameEn: "Rohu Fish 500g",
      descriptionBn: "তাজা রুই মাছ, পরিষ্কার করা।",
      descriptionEn: "Fresh cleaned rohu fish.",
      cat: "fresh-fish",
      unit: "kg",
      mrp: 380,
      salePrice: 320,
      costPrice: 240,
      stockQty: 18,
    },
    {
      sku: `XVM-${rand3()}-shrimp`,
      slug: "shrimp-500g",
      nameBn: "চিংড়ি ৫০০ গ্রাম",
      nameEn: "Shrimp 500g",
      descriptionBn: "তাজা চিংড়ি, ঝাল ও ভুনায় আদর্শ।",
      descriptionEn: "Fresh shrimp, ideal for curry.",
      cat: "fresh-fish",
      unit: "kg",
      mrp: 650,
      salePrice: 580,
      costPrice: 450,
      stockQty: 12,
      isFeatured: true,
    },

    // ───────────────────────── Bakery ─────────────────────────
    {
      sku: `XVM-${rand3()}-brown-bread`,
      slug: "brown-bread",
      nameBn: "ব্রাউন ব্রেড ১টি",
      nameEn: "Brown Bread 1pc",
      descriptionBn: "হেলদি ব্রাউন ব্রেড, সকালের নাস্তায়।",
      descriptionEn: "Healthy brown bread for breakfast.",
      cat: "bread",
      unit: "pcs",
      mrp: 90,
      salePrice: 75,
      costPrice: 50,
      stockQty: 30,
    },
    {
      sku: `XVM-${rand3()}-burger-bun`,
      slug: "burger-bun-4pcs",
      nameBn: "বার্গার বান ৪ পিস",
      nameEn: "Burger Bun 4pcs",
      descriptionBn: "নরম বার্গার বান, হোমমেড বার্গারের জন্য।",
      descriptionEn: "Soft burger buns for homemade burgers.",
      cat: "buns",
      unit: "pack",
      mrp: 110,
      salePrice: 90,
      costPrice: 60,
      stockQty: 35,
    },
    {
      sku: `XVM-${rand3()}-chocolate-cake`,
      slug: "chocolate-cake-500g",
      nameBn: "চকলেট কেক ৫০০ গ্রাম",
      nameEn: "Chocolate Cake 500g",
      descriptionBn: "সফট চকলেট কেক, উৎসবের জন্য আদর্শ।",
      descriptionEn: "Soft chocolate cake, great for celebrations.",
      cat: "cakes",
      unit: "pack",
      mrp: 650,
      salePrice: 580,
      costPrice: 420,
      stockQty: 10,
      isNew: true,
    },

    // ───────────────────────── Frozen & ice-cream ─────────────────────────
    {
      sku: `XVM-${rand3()}-frozen-peas`,
      slug: "frozen-peas-500g",
      nameBn: "ফ্রোজেন মটর ৫০০ গ্রাম",
      nameEn: "Frozen Peas 500g",
      descriptionBn: "ফ্রোজেন মটর, সারাবছর পাওয়া যায়।",
      descriptionEn: "Frozen green peas, available year-round.",
      cat: "frozen-veg",
      unit: "pack",
      mrp: 130,
      salePrice: 110,
      costPrice: 80,
      stockQty: 45,
    },
    {
      sku: `XVM-${rand3()}-ice-cream-vanilla`,
      slug: "ice-cream-vanilla-500ml",
      nameBn: "ভ্যানিলা আইসক্রিম ৫০০ মিলি",
      nameEn: "Vanilla Ice Cream 500ml",
      descriptionBn: "ক্রিমি ভ্যানিলা আইসক্রিম।",
      descriptionEn: "Creamy vanilla ice cream.",
      cat: "ice-cream",
      unit: "L",
      mrp: 250,
      salePrice: 220,
      costPrice: 160,
      stockQty: 25,
    },

    // ───────────────────────── Sweets ─────────────────────────
    {
      sku: `XVM-${rand3()}-rasgulla`,
      slug: "rasgulla-500g",
      nameBn: "রসগোল্লা ৫০০ গ্রাম",
      nameEn: "Rasgulla 500g",
      descriptionBn: "নরম ও রসালো রসগোল্লা।",
      descriptionEn: "Soft spongy rasgulla in syrup.",
      cat: "sweets",
      unit: "pack",
      mrp: 220,
      salePrice: 190,
      costPrice: 140,
      stockQty: 20,
    },
    {
      sku: `XVM-${rand3()}-mishti-doi`,
      slug: "mishti-doi-300g",
      nameBn: "মিষ্টি দই ৩০০ গ্রাম",
      nameEn: "Mishti Doi 300g",
      descriptionBn: "ঐতিহ্যবাহী বাঙালি মিষ্টি দই।",
      descriptionEn: "Traditional Bengali sweet yogurt.",
      cat: "sweets",
      unit: "pack",
      mrp: 120,
      salePrice: 100,
      costPrice: 70,
      stockQty: 30,
    },
  ];

  const productBySlug = new Map<string, { id: string; salePrice: Prisma.Decimal; nameEn: string; sku: string }>();
  for (const p of productSeeds) {
    const cat = subCats.get(p.cat);
    if (!cat) throw new Error(`Missing sub-category ${p.cat}`);

    // Idempotent by slug — SKU is randomized each run so we can't use it for
    // upsert keys. If a product with this slug already exists, update it;
    // otherwise create a new one.
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: {
            nameBn: p.nameBn,
            nameEn: p.nameEn,
            descriptionBn: p.descriptionBn,
            descriptionEn: p.descriptionEn,
            categoryId: cat.id,
            unit: p.unit,
            mrp: new Prisma.Decimal(p.mrp),
            salePrice: new Prisma.Decimal(p.salePrice),
            costPrice: new Prisma.Decimal(p.costPrice),
            isFeatured: p.isFeatured ?? false,
            isNew: p.isNew ?? false,
            isActive: true,
          },
        })
      : await prisma.product.create({
          data: {
            sku: p.sku,
            slug: p.slug,
            nameBn: p.nameBn,
            nameEn: p.nameEn,
            descriptionBn: p.descriptionBn,
            descriptionEn: p.descriptionEn,
            categoryId: cat.id,
            unit: p.unit,
            mrp: new Prisma.Decimal(p.mrp),
            salePrice: new Prisma.Decimal(p.salePrice),
            costPrice: new Prisma.Decimal(p.costPrice),
            isFeatured: p.isFeatured ?? false,
            isNew: p.isNew ?? false,
            isActive: true,
          },
        });

    counts.products++;
    productBySlug.set(p.slug, {
      id: product.id,
      salePrice: product.salePrice,
      nameEn: product.nameEn,
      sku: product.sku,
    });

    // Inventory
    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: { stockQty: p.stockQty, lowStockThreshold: 10, reservedQty: 0 },
      create: { productId: product.id, stockQty: p.stockQty, lowStockThreshold: 10 },
    });
    counts.inventory++;

    // Image — prefer a hand-picked Unsplash photo that matches the product,
    // fall back to a deterministic picsum placeholder for anything new.
    const photoId = PRODUCT_IMAGE[p.slug];
    const imgUrl = photoId
      ? unsplash(photoId)
      : `https://picsum.photos/seed/${product.sku}/400/400`;
    await prisma.productImage.upsert({
      where: { id: `${product.id}-primary` },
      update: { url: imgUrl, altEn: p.nameEn, altBn: p.nameBn },
      create: {
        id: `${product.id}-primary`,
        productId: product.id,
        url: imgUrl,
        altEn: p.nameEn,
        altBn: p.nameBn,
        sortOrder: 0,
      },
    });
    counts.productImages++;

    // Stock movement (initial PURCHASE)
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        delta: p.stockQty,
        reason: "PURCHASE",
        note: "Initial seed stock",
        createdBy: "system",
      },
    });

    console.log(`  ✓ ${product.nameEn} — ৳${p.salePrice} (stock: ${p.stockQty})`);
  }

  // ---------------------------------------------------------------------------
  // 4. Delivery zones
  // ---------------------------------------------------------------------------
  console.log("\n--- Delivery zones ---");
  const zones = [
    {
      // Mudaforgonj core (≤3km) — dense area, no weight surcharge (small grocery deliveries)
      nameBn: "মুদাফরগঞ্জ",
      nameEn: "Mudaforgonj",
      centerLat: 23.4521,
      centerLng: 91.1519,
      radiusKm: 3,
      baseKm: 1,
      baseFee: 30,
      perKmFee: 10,
      perKgFee: 0,
      freeAbove: 1000,
      sortOrder: 1,
    },
    {
      // Laksam Sadar (≤5km) — town, light per-kg surcharge for heavier packs
      nameBn: "লাকসাম সদর",
      nameEn: "Laksam Sadar",
      centerLat: 23.4789,
      centerLng: 91.1423,
      radiusKm: 5,
      baseKm: 1,
      baseFee: 30,
      perKmFee: 10,
      perKgFee: 1,
      freeAbove: 1500,
      sortOrder: 2,
    },
    {
      // Cumilla periphery (≤10km) — far edge, full weight surcharge + heavy override
      nameBn: "কুমিল্লা",
      nameEn: "Cumilla",
      centerLat: 23.4607,
      centerLng: 91.1809,
      radiusKm: 10,
      baseKm: 1,
      baseFee: 30,
      perKmFee: 10,
      perKgFee: 2,
      heavyKgThreshold: 20,
      heavyKgFee: 50,
      freeAbove: 2000,
      sortOrder: 3,
    },
  ];
  for (const z of zones) {
    const id = `seed-zone-${z.nameEn.toLowerCase().replace(/\s+/g, "-")}`;
    const zone = await prisma.deliveryZone.upsert({
      where: { id },
      update: { ...z },
      create: { id, ...z, isActive: true },
    });
    counts.deliveryZones++;
    console.log(`  ✓ Zone: ${zone.nameEn} (৳${zone.baseFee} + ৳${zone.perKmFee}/km + ৳${zone.perKgFee}/kg)`);
  }

  // ---------------------------------------------------------------------------
  // 5. Riders
  // ---------------------------------------------------------------------------
  console.log("\n--- Riders ---");
  const riderSeeds = [
    {
      email: "rider1@xovenmart.com",
      name: "Karim Hossain",
      phone: "+8801711234501",
      currentFloat: 500,
    },
    {
      email: "rider2@xovenmart.com",
      name: "Rafiq Ahmed",
      phone: "+8801711234502",
      currentFloat: 500,
    },
  ];
  const riderByEmail = new Map<string, { id: string }>();
  for (const r of riderSeeds) {
    const passwordHash = await bcrypt.hash("rider123", BCRYPT_ROUNDS);
    const rider = await prisma.rider.upsert({
      where: { email: r.email },
      update: {
        name: r.name,
        phone: r.phone,
        passwordHash,
        currentFloat: new Prisma.Decimal(r.currentFloat),
        isActive: true,
      },
      create: {
        email: r.email,
        name: r.name,
        phone: r.phone,
        passwordHash,
        currentFloat: new Prisma.Decimal(r.currentFloat),
      },
    });
    riderByEmail.set(r.email, { id: rider.id });
    counts.riders++;
    console.log(`  ✓ ${rider.name} (${rider.email})`);
  }

  // ---------------------------------------------------------------------------
  // 6. Customers (with referral chain)
  // ---------------------------------------------------------------------------
  console.log("\n--- Customers ---");
  const userSeeds = [
    { phone: "+8801811234567", name: "Rahim Khan", referralCode: "RAHIM001" },
    { phone: "+8801811234568", name: "Karim Mia", referralCode: "KARIM002" },
    { phone: "+8801811234569", name: "Jamal Uddin", referralCode: "JAMAL003" },
  ];
  const userByPhone = new Map<string, { id: string; referralCode: string }>();
  for (const u of userSeeds) {
    const user = await prisma.user.upsert({
      where: { phone: u.phone },
      update: {
        name: u.name,
        referralCode: u.referralCode,
        registeredAt: new Date(Date.now() - DAYS(15)),
      },
      create: {
        phone: u.phone,
        name: u.name,
        referralCode: u.referralCode,
        registeredAt: new Date(Date.now() - DAYS(15)),
      },
    });
    userByPhone.set(u.phone, { id: user.id, referralCode: user.referralCode });
    counts.customers++;
    console.log(`  ✓ ${u.name} (${u.phone}) — code ${u.referralCode}`);
  }

  // Referral: Jamal was referred by Rahim
  const rahim = userByPhone.get("+8801811234567")!;
  const jamal = userByPhone.get("+8801811234569")!;
  await prisma.referral.upsert({
    where: { referrerId_refereeId: { referrerId: rahim.id, refereeId: jamal.id } },
    update: { status: "REWARDED", rewardedAt: new Date(Date.now() - DAYS(2)) },
    create: {
      referrerId: rahim.id,
      refereeId: jamal.id,
      status: "REWARDED",
      qualifiedAt: new Date(Date.now() - DAYS(5)),
      rewardedAt: new Date(Date.now() - DAYS(2)),
    },
  });
  counts.referrals++;
  console.log(`  ✓ Referral: Rahim → Jamal (REWARDED)`);

  // Notification preference for Rahim
  await prisma.notificationPreference.upsert({
    where: { userId: rahim.id },
    update: {},
    create: {
      userId: rahim.id,
      emailOrderUpdates: true,
      smsOrderUpdates: true,
      pushOrderUpdates: true,
    },
  });

  // ---------------------------------------------------------------------------
  // 7. Discounts / Coupons
  // ---------------------------------------------------------------------------
  console.log("\n--- Discounts ---");
  const now = TODAY;
  const welcome = await prisma.discount.upsert({
    where: { code: "WELCOME10" },
    update: {
      value: new Prisma.Decimal(10),
      type: "PERCENT",
      scope: "ALL",
      minOrder: new Prisma.Decimal(500),
      maxDiscount: new Prisma.Decimal(200),
      startsAt: now,
      endsAt: new Date(now.getTime() + DAYS(30)),
      usageLimit: 100,
      firstOrderOnly: false,
      isActive: true,
    },
    create: {
      code: "WELCOME10",
      type: "PERCENT",
      value: new Prisma.Decimal(10),
      scope: "ALL",
      minOrder: new Prisma.Decimal(500),
      maxDiscount: new Prisma.Decimal(200),
      startsAt: now,
      endsAt: new Date(now.getTime() + DAYS(30)),
      usageLimit: 100,
      firstOrderOnly: false,
      isActive: true,
      descriptionEn: "10% off your first order (max ৳200)",
      descriptionBn: "প্রথম অর্ডারে ১০% ছাড় (সর্বোচ্চ ৳২০০)",
    },
  });
  counts.discounts++;

  await prisma.discount.upsert({
    where: { code: "FLAT50" },
    update: {
      value: new Prisma.Decimal(50),
      type: "FLAT",
      scope: "ALL",
      minOrder: new Prisma.Decimal(1000),
      startsAt: now,
      endsAt: new Date(now.getTime() + DAYS(60)),
      isActive: true,
    },
    create: {
      code: "FLAT50",
      type: "FLAT",
      value: new Prisma.Decimal(50),
      scope: "ALL",
      minOrder: new Prisma.Decimal(1000),
      startsAt: now,
      endsAt: new Date(now.getTime() + DAYS(60)),
      isActive: true,
      descriptionEn: "Flat ৳50 off on orders above ৳1000",
      descriptionBn: "৳১০০০+ অর্ডারে ফ্ল্যাট ৳৫০ ছাড়",
    },
  });
  counts.discounts++;

  const fresh = await prisma.discount.upsert({
    where: { code: "FRESH20" },
    update: {
      value: new Prisma.Decimal(20),
      type: "PERCENT",
      scope: "SPECIFIC_CATEGORIES",
      minOrder: new Prisma.Decimal(300),
      maxDiscount: new Prisma.Decimal(150),
      startsAt: now,
      endsAt: new Date(now.getTime() + DAYS(15)),
      bannerImageUrl: "https://picsum.photos/seed/fresh20/1200/400",
      isActive: true,
    },
    create: {
      code: "FRESH20",
      type: "PERCENT",
      value: new Prisma.Decimal(20),
      scope: "SPECIFIC_CATEGORIES",
      minOrder: new Prisma.Decimal(300),
      maxDiscount: new Prisma.Decimal(150),
      startsAt: now,
      endsAt: new Date(now.getTime() + DAYS(15)),
      bannerImageUrl: "https://picsum.photos/seed/fresh20/1200/400",
      isActive: true,
      descriptionEn: "20% off on fresh veggies & fruits",
      descriptionBn: "তাজা সবজি ও ফলে ২০% ছাড়",
    },
  });
  counts.discounts++;

  // FRESH20 → Fresh Veggies + Fruits
  const freshVeg = subCats.get("fresh-veggies")!;
  const leafy = subCats.get("leafy-greens")!;
  const seasonal = subCats.get("seasonal-fruits")!;
  const local = subCats.get("local-fruits")!;
  for (const cat of [freshVeg, leafy, seasonal, local]) {
    await prisma.discountCategory.upsert({
      where: { discountId_categoryId: { discountId: fresh.id, categoryId: cat.id } },
      update: {},
      create: { discountId: fresh.id, categoryId: cat.id },
    });
    counts.discountCategories++;
  }
  console.log(`  ✓ 3 discounts + ${counts.discountCategories} category links`);

  // ---------------------------------------------------------------------------
  // 8. Site pages
  // ---------------------------------------------------------------------------
  console.log("\n--- Site pages ---");
  const pages = [
    {
      slug: "privacy",
      titleBn: "গোপনীয়তা নীতি",
      titleEn: "Privacy Policy",
      contentBn: `<h2>গোপনীয়তা নীতি</h2>
<p>জোভেন্টমার্ট আপনার ব্যক্তিগত তথ্যের গোপনীয়তাকে সর্বোচ্চ গুরুত্ব দেয়। এই নীতি বর্ণনা করে আমরা কী তথ্য সংগ্রহ করি, কীভাবে ব্যবহার করি এবং কীভাবে সুরক্ষিত রাখি।</p>
<h3>সংগৃহীত তথ্য</h3>
<ul><li>ফোন নম্বর (লগইন ও যোগাযোগের জন্য)</li><li>ডেলিভারি ঠিকানা</li><li>অর্ডার ইতিহাস</li></ul>
<h3>তথ্যের ব্যবহার</h3>
<p>আমরা শুধুমাত্র অর্ডার প্রক্রিয়াকরণ, ডেলিভারি, গ্রাহক সহায়তা এবং আইনি বাধ্যবাধকতার জন্য আপনার তথ্য ব্যবহার করি।</p>
<h3>তৃতীয় পক্ষ</h3>
<p>আমরা আপনার তথ্য তৃতীয় পক্ষের কাছে বিক্রি বা শেয়ার করি না। ডেলিভারির জন্য শুধু প্রয়োজনীয় ঠিকানা রাইডারের সাথে শেয়ার করা হয়।</p>`,
      contentEn: `<h2>Privacy Policy</h2>
<p>XovenMart takes the privacy of your personal data seriously. This policy describes what we collect, how we use it, and how we keep it safe.</p>
<h3>Information We Collect</h3>
<ul><li>Phone number (for login and contact)</li><li>Delivery address</li><li>Order history</li></ul>
<h3>How We Use Information</h3>
<p>We use your data only for order processing, delivery, customer support, and legal compliance.</p>
<h3>Third Parties</h3>
<p>We never sell or share your data with third parties. Only the necessary address is shared with the delivery rider.</p>`,
      isPublished: true,
      showInFooter: true,
      order: 1,
    },
    {
      slug: "terms",
      titleBn: "ব্যবহারের শর্তাবলী",
      titleEn: "Terms of Service",
      contentBn: `<h2>ব্যবহারের শর্তাবলী</h2>
<p>জোভেন্টমার্ট ওয়েবসাইট ও সেবা ব্যবহার করে আপনি নিম্নলিখিত শর্তাবলীতে সম্মত হচ্ছেন।</p>
<h3>অর্ডার ও পেমেন্ট</h3>
<ul><li>সকল মূল্য বাংলাদেশি টাকায় (৳) নির্ধারিত।</li><li>ক্যাশ অন ডেলিভারি গ্রহণযোগ্য।</li><li>স্টক শেষ হয়ে গেলে অর্ডার বাতিল করার অধিকার আমরা সংরক্ষণ করি।</li></ul>
<h3>ডেলিভারি</h3>
<p>আমরা নির্ধারিত ডেলিভারি জোনে ডেলিভারি প্রদান করি। ডেলিভারি সময় আবহাওয়া ও ট্রাফিকের উপর নির্ভরশীল।</p>
<h3>ফেরত ও রিফান্ড</h3>
<p>ডেলিভারির ২৪ ঘণ্টার মধ্যে ফেরত/রিফান্ডের অনুরোধ জানাতে হবে।</p>`,
      contentEn: `<h2>Terms of Service</h2>
<p>By using the XovenMart website and services, you agree to the following terms.</p>
<h3>Orders & Payment</h3>
<ul><li>All prices are in Bangladeshi Taka (৳).</li><li>Cash on Delivery is accepted.</li><li>We reserve the right to cancel orders if items are out of stock.</li></ul>
<h3>Delivery</h3>
<p>We deliver within designated delivery zones. Delivery times are subject to weather and traffic.</p>
<h3>Returns & Refunds</h3>
<p>Return/refund requests must be made within 24 hours of delivery.</p>`,
      isPublished: true,
      showInFooter: true,
      order: 2,
    },
    {
      slug: "about",
      titleBn: "জোভেন্টমার্ট সম্পর্কে",
      titleEn: "About XovenMart",
      contentBn: `<h2>আমাদের সম্পর্কে</h2>
<p>জোভেন্টমার্ট মুদাফরগঞ্জ, লাকসাম, কুমিল্লা অঞ্চলের একটি একক-বিক্রেতা অনলাইন শপিং প্ল্যাটফর্ম। আমরা সরাসরি স্থানীয় সরবরাহকারীদের কাছ থেকে পণ্য সংগ্রহ করে গ্রাহকদের দোরগোড়ায় পৌঁছে দিই।</p>
<h3>আমাদের লক্ষ্য</h3>
<p>সহজে, দ্রুত ও বিশ্বস্তভাবে মানসম্মত পণ্য সরবরাহ করা।</p>
<h3>আমাদের অঞ্চল</h3>
<p>মুদাফরগঞ্জ, লাকসাম সদর ও কুমিল্লা শহরের নির্দিষ্ট এলাকায় আমরা ডেলিভারি দিই।</p>`,
      contentEn: `<h2>About XovenMart</h2>
<p>XovenMart is a single-vendor online shopping platform serving the Mudaforgonj, Laksam, and Cumilla region. We source products directly from local suppliers and deliver them to your doorstep.</p>
<h3>Our Mission</h3>
<p>To deliver quality products easily, quickly, and reliably.</p>
<h3>Service Area</h3>
<p>We deliver across Mudaforgonj, Laksam Sadar, and selected areas of Cumilla city.</p>`,
      isPublished: true,
      showInFooter: true,
      order: 3,
    },
  ];

  for (const p of pages) {
    await prisma.sitePage.upsert({
      where: { slug: p.slug },
      update: {
        titleBn: p.titleBn,
        titleEn: p.titleEn,
        contentBn: p.contentBn,
        contentEn: p.contentEn,
        isPublished: p.isPublished,
        showInFooter: p.showInFooter,
        order: p.order,
      },
      create: p,
    });
    counts.sitePages++;
    console.log(`  ✓ Page: ${p.slug}`);
  }

  // ---------------------------------------------------------------------------
  // 9. FAQs
  // ---------------------------------------------------------------------------
  console.log("\n--- FAQs ---");
  // Two sources of truth used to live side-by-side: the public /faq page had a
  // hardcoded 10-item array and the admin FAQ Manager read from this DB table.
  // They're now unified — every FAQ the customer sees must be a row here so
  // admin edits propagate without a redeploy. The public /faq view now fetches
  // GET /api/v1/faqs/public (which filters isPublished=true).
  //
  // Categories are normalized to: ordering | delivery | payment | returns |
  // general — used by the public page to bucket questions under headings.
  const faqs: Array<{
    category: string;
    questionBn: string;
    questionEn: string;
    answerBn: string;
    answerEn: string;
  }> = [
    // ─── Delivery ──────────────────────────────────────────────
    {
      category: "delivery",
      questionBn: "ডেলিভারি কত সময়ে হবে?",
      questionEn: "How long does delivery take?",
      answerBn: "মুদাফরগঞ্জ, লাকসাম ও আশেপাশের এলাকায় সাধারণত ৩০ থেকে ৬০ মিনিটের মধ্যে ডেলিভারি দেওয়া হয়। কুমিল্লা সদরে ১-২ ঘণ্টা লাগতে পারে।",
      answerEn: "Delivery is usually within 30–60 minutes in Mudafarganj, Laksam and surrounding areas. Cumilla Sadar may take 1–2 hours.",
    },
    {
      category: "delivery",
      questionBn: "কোন এলাকায় ডেলিভারি দেওয়া হয়?",
      questionEn: "Which areas do you deliver to?",
      answerBn: "মুদাফরগঞ্জ, লাকসাম, কুমিল্লা সদর, চাঁদপুর সদর এবং আশেপাশের গ্রামীণ এলাকা।",
      answerEn: "Mudafarganj, Laksam, Cumilla Sadar, Chandpur Sadar, and surrounding rural areas.",
    },
    {
      category: "delivery",
      questionBn: "ডেলিভারি চার্জ কত?",
      questionEn: "How much is the delivery charge?",
      answerBn: "এলাকাভেদে ৳৩০ থেকে ৳১০০ পর্যন্ত। ৳১০০০ বা তার বেশি অর্ডারে নির্দিষ্ট এলাকায় ফ্রি ডেলিভারি।",
      answerEn: "Between ৳30 and ৳100 depending on area. Orders ≥ ৳1000 get free delivery in select areas.",
    },
    // ─── Payment ───────────────────────────────────────────────
    {
      category: "payment",
      questionBn: "কোন কোন পেমেন্ট পদ্ধতি গ্রহণযোগ্য?",
      questionEn: "Which payment methods are accepted?",
      answerBn: "এখন আমরা ক্যাশ অন ডেলিভারি (COD) গ্রহণ করি। শীঘ্রই bKash ও Nagad যুক্ত হবে।",
      answerEn: "We currently accept Cash on Delivery (COD). bKash and Nagad are coming soon.",
    },
    // ─── Ordering ──────────────────────────────────────────────
    {
      category: "ordering",
      questionBn: "মিনিমাম অর্ডার কত?",
      questionEn: "What's the minimum order?",
      answerBn: "মিনিমাম অর্ডার ৳১০০। এর কম হলে ডেলিভারি চার্জ বেশি হতে পারে।",
      answerEn: "Minimum order is ৳100. Below that, delivery charge may be higher.",
    },
    {
      category: "ordering",
      questionBn: "অর্ডার কিভাবে ট্র্যাক করব?",
      questionEn: "How do I track my order?",
      answerBn: "হেডারে 'অর্ডার ট্র্যাক' বাটনে ক্লিক করুন অথবা /track পেজে গিয়ে অর্ডার নম্বর দিন।",
      answerEn: "Click the 'Track Order' button in the header, or go to /track and enter your order number.",
    },
    {
      category: "ordering",
      questionBn: "অর্ডার বাতিল করতে পারব?",
      questionEn: "Can I cancel my order?",
      answerBn: "হ্যাঁ, অর্ডার কনফার্ম হওয়ার আগে যোগাযোগ করলে বাতিল করা যাবে।",
      answerEn: "Yes — contact us before the order is confirmed and we'll cancel it.",
    },
    {
      category: "ordering",
      questionBn: "রাতের বেলা অর্ডার করা যাবে?",
      questionEn: "Can I order at night?",
      answerBn: "আমরা সকাল ৮টা থেকে রাত ১০টা পর্যন্ত অর্ডার গ্রহণ করি।",
      answerEn: "We accept orders from 8 AM to 10 PM.",
    },
    // ─── Returns ───────────────────────────────────────────────
    {
      category: "returns",
      questionBn: "পণ্য ফেরত দেওয়া যাবে?",
      questionEn: "Can I return a product?",
      answerBn: "হ্যাঁ। পণ্য গ্রহণের সময় যাচাই করুন। সমস্যা থাকলে ২৪ ঘণ্টার মধ্যে +৮৮০১৭১০০০০০০০ নম্বরে যোগাযোগ করুন।",
      answerEn: "Yes. Inspect the product on receipt. If there's a problem, contact +8801710000000 within 24 hours.",
    },
    {
      category: "returns",
      questionBn: "রিফান্ড কিভাবে পাব?",
      questionEn: "How do I get a refund?",
      answerBn: "রিটার্ন পণ্য গ্রহণের পর ২-৩ কর্মদিবসের মধ্যে রিফান্ড প্রক্রিয়া হয়। COD হলে বিকাশ/নগদে পাঠানো হয়।",
      answerEn: "Refunds are processed within 2–3 business days after the returned product is received. COD orders are refunded via bKash/Nagad.",
    },
  ];

  // Insert idempotently — match on (category, questionEn). sortOrder preserves
  // the order above so admin and public see the same sequence.
  for (const [i, f] of faqs.entries()) {
    const existing = await prisma.faq.findFirst({
      where: { category: f.category, questionEn: f.questionEn },
    });
    if (!existing) {
      await prisma.faq.create({
        data: { ...f, isPublished: true, sortOrder: i },
      });
    }
    counts.faqs++;
  }
  console.log(`  ✓ ${counts.faqs} FAQs (${faqs.length} source rows + admin-added)`);

  // ---------------------------------------------------------------------------
  // 10. Banners
  // ---------------------------------------------------------------------------
  console.log("\n--- Banners ---");
  const banners = [
    {
      imageUrl: "https://picsum.photos/seed/xovent-hero/1600/600",
      mobileImageUrl: "https://picsum.photos/seed/xovent-hero/800/600",
      linkUrl: "/products",
      titleBn: "তাজা মুদিখানা সরাসরি দোরগোড়ায়",
      titleEn: "Fresh Groceries Delivered",
      subtitleBn: "মুদাফরগঞ্জ, লাকসাম ও কুমিল্লায় একই দিনে ডেলিভারি",
      subtitleEn: "Same-day delivery across Mudaforgonj, Laksam & Cumilla",
      position: "homepage_hero",
      isActive: true,
      sortOrder: 1,
    },
    {
      imageUrl: "https://picsum.photos/seed/xovent-deals/1200/400",
      linkUrl: "/products?filter=deals",
      titleBn: "এই সপ্তাহের সেরা ছাড়",
      titleEn: "Best Deals This Week",
      subtitleBn: "২০% পর্যন্ত ছাড় — FRESH20 কোড ব্যবহার করুন",
      subtitleEn: "Up to 20% off — use code FRESH20",
      position: "homepage_middle",
      isActive: true,
      sortOrder: 1,
    },
  ];
  for (const b of banners) {
    const existing = await prisma.banner.findFirst({ where: { titleEn: b.titleEn, position: b.position } });
    if (existing) {
      await prisma.banner.update({ where: { id: existing.id }, data: b });
    } else {
      await prisma.banner.create({ data: b });
    }
    counts.banners++;
    console.log(`  ✓ Banner: ${b.titleEn}`);
  }

  // ---------------------------------------------------------------------------
  // 11. App settings
  // ---------------------------------------------------------------------------
  console.log("\n--- App settings ---");
  const settings: Array<{ key: string; value: Prisma.InputJsonValue }> = [
    { key: "store.nameEn", value: "XovenMart" },
    { key: "store.nameBn", value: "জোভেন্টমার্ট" },
    { key: "store.phone", value: "+8801710000000" },
    { key: "store.email", value: "hello@xovenmart.com" },
    { key: "store.addressEn", value: "Mudaforgonj Bazar, Laksam, Cumilla" },
    { key: "currency.code", value: "BDT" },
    { key: "currency.symbol", value: "৳" },
    { key: "feature.cod", value: true },
    { key: "feature.bkash", value: false },
    { key: "feature.nagad", value: false },
    { key: "feature.referrals", value: true },
    { key: "feature.maintenance", value: false },
    // ─── Customer auth toggles (admin-controlled from /admin/system/auth) ───
    // Defaults match the agreed product decision: OTP required, delivered
    // via email (zero marginal cost vs SMS). Admin can flip either switch
    // at runtime from the auth-settings page.
    { key: "auth.customer.otpRequired", value: true },
    { key: "auth.customer.otpChannel", value: "EMAIL" },
    { key: "auth.customer.otpLength", value: 6 },
    { key: "auth.customer.otpTtlMinutes", value: 10 },
    { key: "auth.customer.otpMaxAttempts", value: 5 },
  ];
  for (const s of settings) {
    const jsonStr = JSON.stringify(s.value);
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: { value: jsonStr },
      create: { key: s.key, value: jsonStr },
    });
    counts.appSettings++;
  }
  console.log(`  ✓ ${counts.appSettings} app settings`);

  // ---------------------------------------------------------------------------
  // 12. PayrollConfig (default — applies to all riders)
  // ---------------------------------------------------------------------------
  console.log("\n--- Payroll config ---");
  const defaultPayroll = await prisma.payrollConfig.findFirst({ where: { riderId: null } });
  if (!defaultPayroll) {
    await prisma.payrollConfig.create({
      data: {
        riderId: null,
        baseSalary: new Prisma.Decimal(0),
        perDeliveryRate: new Prisma.Decimal(30),
        codCommissionPercent: new Prisma.Decimal(1),
        maxAdvance: new Prisma.Decimal(5000),
        isActive: true,
      },
    });
  } else {
    await prisma.payrollConfig.update({
      where: { id: defaultPayroll.id },
      data: {
        baseSalary: new Prisma.Decimal(0),
        perDeliveryRate: new Prisma.Decimal(30),
        codCommissionPercent: new Prisma.Decimal(1),
        maxAdvance: new Prisma.Decimal(5000),
        isActive: true,
      },
    });
  }
  counts.payrollConfigs++;
  console.log("  ✓ Default payroll config (৳30/delivery, 1% COD commission)");

  // ---------------------------------------------------------------------------
  // 13. Sample orders
  // ---------------------------------------------------------------------------
  console.log("\n--- Orders ---");
  const rahimId = rahim.id;
  const jamalId = jamal.id;
  const karimId = userByPhone.get("+8801811234568")!.id;
  const riderKarimId = riderByEmail.get("rider1@xovenmart.com")!.id;
  const riderRafiqId = riderByEmail.get("rider2@xovenmart.com")!.id;

  const riceProd = productBySlug.get("premium-basmati-rice-5kg")!;
  const oilProd = productBySlug.get("mustard-oil-1l")!;
  const mangoProd = productBySlug.get("mango-1kg")!;
  const chipsProd = productBySlug.get("potato-chips-100g")!;
  const waterProd = productBySlug.get("mineral-water-1-5l")!;
  const soapProd = productBySlug.get("bath-soap-4-pack")!;

  // ---- Order 1: Rahim Khan, PENDING ----
  const order1No = "XVM-260829-001";
  const order1Existing = await prisma.order.findUnique({ where: { orderNo: order1No } });
  if (!order1Existing) {
    const itemRiceTotal = Number(riceProd.salePrice) * 1;
    const itemOilTotal = Number(oilProd.salePrice) * 2;
    const o1Subtotal = itemRiceTotal + itemOilTotal;
    const o1Delivery = 40;
    const o1Grand = o1Subtotal + o1Delivery;
    const order1 = await prisma.order.create({
      data: {
        orderNo: order1No,
        userId: rahimId,
        guestName: null,
        guestPhone: null,
        addressSnapshot: {
          label: "Home",
          area: "mudaforgonj",
          landmark: "Near Mudaforgonj Bazar",
          fullText: "House 12, Road 3, Mudaforgonj Bazar, Laksam, Cumilla",
          lat: 23.4521,
          lng: 91.1519,
        },
        status: "PENDING",
        subtotal: new Prisma.Decimal(o1Subtotal),
        discountTotal: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(o1Delivery),
        grandTotal: new Prisma.Decimal(o1Grand),
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        items: {
          create: [
            {
              productId: riceProd.id,
              nameSnapshot: riceProd.nameEn,
              unitPrice: riceProd.salePrice,
              qty: 1,
              lineTotal: new Prisma.Decimal(itemRiceTotal),
            },
            {
              productId: oilProd.id,
              nameSnapshot: oilProd.nameEn,
              unitPrice: oilProd.salePrice,
              qty: 2,
              lineTotal: new Prisma.Decimal(itemOilTotal),
            },
          ],
        },
        statusEvents: {
          create: [
            { fromStatus: null, toStatus: "PENDING", actorRole: "ADMIN", note: "Order placed" },
          ],
        },
        payments: {
          create: {
            provider: "COD",
            amount: new Prisma.Decimal(o1Grand),
            status: "PENDING",
          },
        },
        delivery: {
          create: {
            riderId: null,
            proofStatus: "PENDING",
          },
        },
      },
    });
    counts.orders++;
    counts.orderItems += 2;
    counts.orderStatusEvents++;
    counts.deliveries++;
    console.log(`  ✓ Order ${order1.orderNo} (Rahim Khan, PENDING) — ৳${o1Grand}`);
  } else {
    counts.orders++;
    counts.orderItems += 2;
    counts.deliveries++;
  }

  // ---- Order 2: Jamal Uddin, DELIVERED ----
  const order2No = "XVM-260829-002";
  const order2Existing = await prisma.order.findUnique({ where: { orderNo: order2No } });
  if (!order2Existing) {
    const mangoQty = 2;
    const o2Subtotal = Number(mangoProd.salePrice) * mangoQty;
    const o2Delivery = 40;
    const o2Grand = o2Subtotal + o2Delivery;
    const order2 = await prisma.order.create({
      data: {
        orderNo: order2No,
        userId: jamalId,
        addressSnapshot: {
          label: "Home",
          area: "laksam sadar",
          landmark: "Opposite Laksam College",
          fullText: "House 5, College Road, Laksam Sadar, Cumilla",
          lat: 23.4789,
          lng: 91.1423,
        },
        status: "DELIVERED",
        subtotal: new Prisma.Decimal(o2Subtotal),
        discountTotal: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(o2Delivery),
        grandTotal: new Prisma.Decimal(o2Grand),
        paymentMethod: "COD",
        paymentStatus: "VERIFIED",
        deliveredAt: new Date(Date.now() - DAYS(2)),
        placedAt: new Date(Date.now() - DAYS(5)),
        items: {
          create: [
            {
              productId: mangoProd.id,
              nameSnapshot: mangoProd.nameEn,
              unitPrice: mangoProd.salePrice,
              qty: mangoQty,
              lineTotal: new Prisma.Decimal(o2Subtotal),
            },
          ],
        },
        statusEvents: {
          create: [
            { fromStatus: null, toStatus: "PENDING", actorRole: "ADMIN", note: "Order placed", createdAt: new Date(Date.now() - DAYS(5)) },
            { fromStatus: "PENDING", toStatus: "ACCEPTED", actorRole: "ADMIN", note: "Accepted", createdAt: new Date(Date.now() - DAYS(5) + HOURS(1)) },
            { fromStatus: "ACCEPTED", toStatus: "PREPARING", actorRole: "ADMIN", createdAt: new Date(Date.now() - DAYS(5) + HOURS(2)) },
            { fromStatus: "PREPARING", toStatus: "PREPARED", actorRole: "ADMIN", createdAt: new Date(Date.now() - DAYS(5) + HOURS(3)) },
            { fromStatus: "PREPARED", toStatus: "OUT_FOR_DELIVERY", actorRole: "ADMIN", note: "Handed to rider", createdAt: new Date(Date.now() - DAYS(3)) },
            { fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED", actorRole: "ADMIN", note: "Cash collected", createdAt: new Date(Date.now() - DAYS(2)) },
          ],
        },
        payments: {
          create: {
            provider: "COD",
            amount: new Prisma.Decimal(o2Grand),
            status: "VERIFIED",
            verifiedAt: new Date(Date.now() - DAYS(2)),
          },
        },
        delivery: {
          create: {
            riderId: riderKarimId,
            assignedAt: new Date(Date.now() - DAYS(3)),
            pickedAt: new Date(Date.now() - DAYS(3) + HOURS(1)),
            deliveredAt: new Date(Date.now() - DAYS(2)),
            proofStatus: "DELIVERED",
            cashCollected: new Prisma.Decimal(o2Grand),
            podOtp: "482931",
          },
        },
      },
    });
    counts.orders++;
    counts.orderItems++;
    counts.orderStatusEvents += 6;
    counts.deliveries++;
    console.log(`  ✓ Order ${order2.orderNo} (Jamal Uddin, DELIVERED) — ৳${o2Grand}`);
  } else {
    counts.orders++;
    counts.orderItems++;
    counts.deliveries++;
  }

  // ---- Order 3: Karim Mia, OUT_FOR_DELIVERY ----
  const order3No = "XVM-260829-003";
  const order3Existing = await prisma.order.findUnique({ where: { orderNo: order3No } });
  if (!order3Existing) {
    const chipsQty = 2;
    const waterQty = 1;
    const soapQty = 1;
    const itemChips = Number(chipsProd.salePrice) * chipsQty;
    const itemWater = Number(waterProd.salePrice) * waterQty;
    const itemSoap = Number(soapProd.salePrice) * soapQty;
    const o3Subtotal = itemChips + itemWater + itemSoap;
    const o3Delivery = 40;
    const o3Grand = o3Subtotal + o3Delivery;
    const order3 = await prisma.order.create({
      data: {
        orderNo: order3No,
        userId: karimId,
        addressSnapshot: {
          label: "Office",
          area: "cumilla",
          landmark: "Near Cumilla University gate",
          fullText: "Flat 3B, Kotbari, Cumilla",
          lat: 23.4607,
          lng: 91.1809,
        },
        status: "OUT_FOR_DELIVERY",
        subtotal: new Prisma.Decimal(o3Subtotal),
        discountTotal: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(o3Delivery),
        grandTotal: new Prisma.Decimal(o3Grand),
        paymentMethod: "COD",
        paymentStatus: "PENDING",
        placedAt: new Date(Date.now() - HOURS(8)),
        items: {
          create: [
            {
              productId: chipsProd.id,
              nameSnapshot: chipsProd.nameEn,
              unitPrice: chipsProd.salePrice,
              qty: chipsQty,
              lineTotal: new Prisma.Decimal(itemChips),
            },
            {
              productId: waterProd.id,
              nameSnapshot: waterProd.nameEn,
              unitPrice: waterProd.salePrice,
              qty: waterQty,
              lineTotal: new Prisma.Decimal(itemWater),
            },
            {
              productId: soapProd.id,
              nameSnapshot: soapProd.nameEn,
              unitPrice: soapProd.salePrice,
              qty: soapQty,
              lineTotal: new Prisma.Decimal(itemSoap),
            },
          ],
        },
        statusEvents: {
          create: [
            { fromStatus: null, toStatus: "PENDING", actorRole: "ADMIN", note: "Order placed", createdAt: new Date(Date.now() - HOURS(8)) },
            { fromStatus: "PENDING", toStatus: "ACCEPTED", actorRole: "ADMIN", createdAt: new Date(Date.now() - HOURS(7)) },
            { fromStatus: "ACCEPTED", toStatus: "PREPARING", actorRole: "ADMIN", createdAt: new Date(Date.now() - HOURS(6)) },
            { fromStatus: "PREPARING", toStatus: "PREPARED", actorRole: "ADMIN", createdAt: new Date(Date.now() - HOURS(3)) },
            { fromStatus: "PREPARED", toStatus: "OUT_FOR_DELIVERY", actorRole: "ADMIN", note: "Handed to rider", createdAt: new Date(Date.now() - HOURS(1)) },
          ],
        },
        payments: {
          create: {
            provider: "COD",
            amount: new Prisma.Decimal(o3Grand),
            status: "PENDING",
          },
        },
        delivery: {
          create: {
            riderId: riderRafiqId,
            assignedAt: new Date(Date.now() - HOURS(1)),
            pickedAt: new Date(Date.now() - HOURS(0.5)),
            proofStatus: "PENDING",
          },
        },
      },
    });
    counts.orders++;
    counts.orderItems += 3;
    counts.orderStatusEvents += 5;
    counts.deliveries++;
    console.log(`  ✓ Order ${order3.orderNo} (Karim Mia, OUT_FOR_DELIVERY) — ৳${o3Grand}`);
  } else {
    counts.orders++;
    counts.orderItems += 3;
    counts.deliveries++;
  }

  // ---------------------------------------------------------------------------
  // 14. Sample expenses
  // ---------------------------------------------------------------------------
  console.log("\n--- Expenses ---");
  // Idempotency: skip if a record with the same descriptionEn exists for today
  const expenseSeeds: Array<{
    category: "LOGISTICS" | "MARKETING" | "TECH";
    amount: number;
    descriptionBn: string;
    descriptionEn: string;
    vendorName: string;
    incurredAt: Date;
  }> = [
    {
      category: "LOGISTICS",
      amount: 500,
      descriptionBn: "রাইডারের জন্য জ্বালানি",
      descriptionEn: "Fuel for delivery bike",
      vendorName: "Local Fuel Station",
      incurredAt: TODAY,
    },
    {
      category: "MARKETING",
      amount: 2000,
      descriptionBn: "ফেসবুক বুস্ট",
      descriptionEn: "Facebook page boost",
      vendorName: "Meta",
      incurredAt: new Date(TODAY.getTime() - DAYS(1)),
    },
    {
      category: "TECH",
      amount: 1050,
      descriptionBn: "VPS হোস্টিং মাসিক বিল",
      descriptionEn: "VPS hosting monthly bill",
      vendorName: "DigitalOcean",
      incurredAt: new Date(TODAY.getTime() - DAYS(3)),
    },
  ];
  for (const e of expenseSeeds) {
    const exists = await prisma.expense.findFirst({
      where: { descriptionEn: e.descriptionEn, incurredAt: e.incurredAt },
    });
    if (!exists) {
      await prisma.expense.create({
        data: {
          category: e.category,
          amount: new Prisma.Decimal(e.amount),
          paymentMethod: "BKASH",
          descriptionBn: e.descriptionBn,
          descriptionEn: e.descriptionEn,
          vendorName: e.vendorName,
          incurredAt: e.incurredAt,
          recordedById: "system",
        },
      });
      counts.expenses++;
    } else {
      counts.expenses++;
    }
    console.log(`  ✓ Expense: ${e.descriptionEn} — ৳${e.amount}`);
  }

  // ---------------------------------------------------------------------------
  // 15. Suppliers (vendors) — admin-only sourcing records
  // ---------------------------------------------------------------------------
  console.log("\n--- Suppliers ---");
  if (!counts.suppliers) counts.suppliers = 0;

  const supplierSeeds: Array<{
    slug: string;
    nameBn: string;
    nameEn: string;
    contactName: string;
    phone: string;
    area: string;
    rating: number;
    notesBn: string;
    notesEn: string;
  }> = [
    {
      slug: "karim-rice-wholesale",
      nameBn: "করিম রাইস হোলসেল",
      nameEn: "Karim Rice Wholesale",
      contactName: "করিম মিয়া",
      phone: "01711-111111",
      area: "লাকসাম সদর, কুমিল্লা",
      rating: 5,
      notesBn: "সব ধরনের চাল পাইকারি, মিনিকেট সেরা",
      notesEn: "Wholesale rice; Miniket quality is reliable",
    },
    {
      slug: "cumilla-veg-coop",
      nameBn: "কুমিল্লা সবজি সমবায়",
      nameEn: "Cumilla Veg Coop",
      contactName: "রহিম সরকার",
      phone: "01712-222222",
      area: "কুমিল্লা শহর",
      rating: 4,
      notesBn: "সকাল ৬টায় ফ্রেশ সবজি আসে",
      notesEn: "Fresh veggies arrive at 6 AM daily",
    },
    {
      slug: "local-dairy-farm",
      nameBn: "স্থানীয় ডেইরি ফার্ম",
      nameEn: "Local Dairy Farm",
      contactName: "জামাল",
      phone: "01713-333333",
      area: "মুদাফরগঞ্জ",
      rating: 4,
      notesBn: "দুধ ও ডিম",
      notesEn: "Milk and eggs",
    },
    {
      slug: "spice-bazaar",
      nameBn: "মসলা বাজার",
      nameEn: "Spice Bazaar",
      contactName: "হাশেম",
      phone: "01714-444444",
      area: "চকবাজার, কুমিল্লা",
      rating: 3,
      notesBn: "মসলা ও তেল",
      notesEn: "Spices and oil",
    },
  ];

  const supplierBySlug = new Map<string, { id: string }>();
  for (const s of supplierSeeds) {
    const existing = await prisma.supplier.findUnique({ where: { slug: s.slug } });
    if (existing) {
      supplierBySlug.set(s.slug, existing);
      console.log(`  • Supplier exists: ${s.nameEn}`);
    } else {
      const created = await prisma.supplier.create({
        data: {
          slug: s.slug,
          nameBn: s.nameBn,
          nameEn: s.nameEn,
          contactName: s.contactName,
          phone: s.phone,
          area: s.area,
          rating: s.rating,
          notesBn: s.notesBn,
          notesEn: s.notesEn,
          isActive: true,
        },
      });
      supplierBySlug.set(s.slug, created);
      counts.suppliers++;
      console.log(`  ✓ Supplier: ${s.nameEn}`);
    }
  }

  // Pre-link products to suppliers (SupplierProduct)
  // Find a few products by slug/name to seed realistic links
  const riceProduct = await prisma.product.findFirst({
    where: { slug: { contains: "rice", mode: "insensitive" } },
  });
  const dairyProduct = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: { contains: "milk", mode: "insensitive" } },
        { nameEn: { contains: "milk", mode: "insensitive" } },
      ],
    },
  });
  const spiceProduct = await prisma.product.findFirst({
    where: {
      OR: [
        { slug: { contains: "oil", mode: "insensitive" } },
        { nameEn: { contains: "oil", mode: "insensitive" } },
        { slug: { contains: "spice", mode: "insensitive" } },
      ],
    },
  });

  const productLinkSeeds: Array<{
    supplierSlug: string;
    productId: string;
    isPrimary: boolean;
    unitCost: number;
  }> = [];
  if (riceProduct) {
    productLinkSeeds.push({
      supplierSlug: "karim-rice-wholesale",
      productId: riceProduct.id,
      isPrimary: true,
      unitCost: 60,
    });
  }
  if (dairyProduct) {
    productLinkSeeds.push({
      supplierSlug: "local-dairy-farm",
      productId: dairyProduct.id,
      isPrimary: true,
      unitCost: 70,
    });
  }
  if (spiceProduct) {
    productLinkSeeds.push({
      supplierSlug: "spice-bazaar",
      productId: spiceProduct.id,
      isPrimary: true,
      unitCost: 180,
    });
  }

  for (const link of productLinkSeeds) {
    const supplier = supplierBySlug.get(link.supplierSlug);
    if (!supplier) continue;
    await prisma.supplierProduct.upsert({
      where: {
        supplierId_productId: {
          supplierId: supplier.id,
          productId: link.productId,
        },
      },
      update: {
        isPrimary: link.isPrimary,
        unitCost: link.unitCost,
      },
      create: {
        supplierId: supplier.id,
        productId: link.productId,
        isPrimary: link.isPrimary,
        unitCost: link.unitCost,
      },
    });
    console.log(`  ↳ Linked product ${link.productId.slice(0, 8)} → ${link.supplierSlug}`);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("✅ Seed complete!");
  console.log("=".repeat(60));
  console.log(`Admins:                ${counts.admins}`);
  console.log(`Categories:            ${counts.categories} (root + sub)`);
  console.log(`Products:              ${counts.products}`);
  console.log(`Product images:        ${counts.productImages}`);
  console.log(`Inventory rows:        ${counts.inventory}`);
  console.log(`Riders:                ${counts.riders}`);
  console.log(`Customers:             ${counts.customers}`);
  console.log(`Referrals:             ${counts.referrals}`);
  console.log(`Delivery zones:        ${counts.deliveryZones}`);
  console.log(`Discounts:             ${counts.discounts}`);
  console.log(`DiscountCategories:    ${counts.discountCategories}`);
  console.log(`Site pages:            ${counts.sitePages}`);
  console.log(`FAQs:                  ${counts.faqs}`);
  console.log(`Banners:               ${counts.banners}`);
  console.log(`App settings:          ${counts.appSettings}`);
  console.log(`Orders:                ${counts.orders}`);
  console.log(`Order items:           ${counts.orderItems}`);
  console.log(`Order status events:   ${counts.orderStatusEvents}`);
  console.log(`Deliveries:            ${counts.deliveries}`);
  console.log(`Payroll configs:       ${counts.payrollConfigs}`);
  console.log(`Expenses:              ${counts.expenses}`);
  console.log(`Suppliers:             ${counts.suppliers}`);
  console.log("=".repeat(60));
  console.log("\nLogins:");
  console.log("  Admin login: admin@xovenmart.com / admin123");
  console.log("  Manager login: manager@xovenmart.com / manager123");
  console.log("  Staff login: staff@xovenmart.com / staff123");
  console.log("  Rider login: rider1@xovenmart.com / rider123");
  console.log("  Customer phones: +8801811234567 (Rahim), +8801811234568 (Karim), +8801811234569 (Jamal)\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });