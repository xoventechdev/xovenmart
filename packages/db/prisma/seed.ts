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
//   • 8 root + 8 sub-categories (Bangla + English)
//   • 20 products with inventory and stock movement history
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
  const rootDefs = [
    { slug: "grocery", nameBn: "মুদিখানা", nameEn: "Grocery", sortOrder: 1 },
    { slug: "vegetables", nameBn: "সবজি", nameEn: "Vegetables", sortOrder: 2 },
    { slug: "fruits", nameBn: "ফলমূল", nameEn: "Fruits", sortOrder: 3 },
    { slug: "dairy", nameBn: "দুগ্ধজাত", nameEn: "Dairy", sortOrder: 4 },
    { slug: "snacks", nameBn: "স্ন্যাক্স", nameEn: "Snacks", sortOrder: 5 },
    { slug: "beverages", nameBn: "পানীয়", nameEn: "Beverages", sortOrder: 6 },
    { slug: "household", nameBn: "গৃহস্থালি", nameEn: "Household", sortOrder: 7 },
    { slug: "personal-care", nameBn: "ব্যক্তিগত যত্ন", nameEn: "Personal Care", sortOrder: 8 },
  ];

  const rootCats = new Map<string, { id: string }>();
  for (const r of rootDefs) {
    const cat = await prisma.category.upsert({
      where: { slug: r.slug },
      update: { nameBn: r.nameBn, nameEn: r.nameEn, sortOrder: r.sortOrder, parentId: null },
      create: { ...r, parentId: null, isActive: true },
    });
    rootCats.set(r.slug, cat);
    counts.categories++;
    console.log(`  ✓ Root: ${r.nameEn}`);
  }

  const subDefs: Array<{ slug: string; nameBn: string; nameEn: string; parent: string; sortOrder: number }> = [
    { slug: "rice", nameBn: "চাল", nameEn: "Rice", parent: "grocery", sortOrder: 1 },
    { slug: "oil", nameBn: "তেল", nameEn: "Oil", parent: "grocery", sortOrder: 2 },
    { slug: "spices", nameBn: "মসলা", nameEn: "Spices", parent: "grocery", sortOrder: 3 },
    { slug: "fresh-veggies", nameBn: "তাজা সবজি", nameEn: "Fresh Veggies", parent: "vegetables", sortOrder: 1 },
    { slug: "leafy-greens", nameBn: "পাতা সবজি", nameEn: "Leafy Greens", parent: "vegetables", sortOrder: 2 },
    { slug: "seasonal-fruits", nameBn: "মৌসুমী ফল", nameEn: "Seasonal Fruits", parent: "fruits", sortOrder: 1 },
    { slug: "local-fruits", nameBn: "স্থানীয় ফল", nameEn: "Local Fruits", parent: "fruits", sortOrder: 2 },
    { slug: "milk", nameBn: "দুধ", nameEn: "Milk", parent: "dairy", sortOrder: 1 },
    { slug: "yogurt", nameBn: "দই", nameEn: "Yogurt", parent: "dairy", sortOrder: 2 },
    { slug: "chips-biscuits", nameBn: "চি�স ও বিস্কুট", nameEn: "Chips & Biscuits", parent: "snacks", sortOrder: 1 },
    { slug: "soft-drinks", nameBn: "কোমল পানীয়", nameEn: "Soft Drinks", parent: "beverages", sortOrder: 1 },
    { slug: "cleaning", nameBn: "পরিষ্কার", nameEn: "Cleaning", parent: "household", sortOrder: 1 },
    { slug: "skincare", nameBn: "ত্বকের যত্ন", nameEn: "Skincare", parent: "personal-care", sortOrder: 1 },
  ];

  const subCats = new Map<string, { id: string }>();
  for (const s of subDefs) {
    const parent = rootCats.get(s.parent);
    if (!parent) throw new Error(`Missing root category ${s.parent}`);
    const cat = await prisma.category.upsert({
      where: { slug: s.slug },
      update: { nameBn: s.nameBn, nameEn: s.nameEn, sortOrder: s.sortOrder, parentId: parent.id },
      create: { slug: s.slug, nameBn: s.nameBn, nameEn: s.nameEn, sortOrder: s.sortOrder, parentId: parent.id, isActive: true },
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

    // Image
    const imgUrl = `https://picsum.photos/seed/${product.sku}/400/400`;
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
  const faqs = [
    {
      category: "ordering",
      questionBn: "কিভাবে অর্ডার করবো?",
      questionEn: "How do I place an order?",
      answerBn: "পণ্য নির্বাচন করে কার্টে যোগ করুন, তারপর চেকআউটে গিয়ে আপনার ঠিকানা দিন এবং অর্ডার নিশ্চিত করুন।",
      answerEn: "Select your products, add them to cart, then proceed to checkout and confirm your order with your delivery address.",
    },
    {
      category: "delivery",
      questionBn: "ডেলিভারি কত ঘণ্টায় হবে?",
      questionEn: "What are the delivery hours?",
      answerBn: "আমরা সকাল ৯টা থেকে রাত ৮টা পর্যন্ত ডেলিভারি দিই। সাধারণত ১-২ দিনের মধ্যে আপনার অর্ডার পৌঁছে যাবে।",
      answerEn: "We deliver between 9 AM and 8 PM. Most orders are delivered within 1–2 days.",
    },
    {
      category: "payment",
      questionBn: "আপনারা কি বিকাশ গ্রহণ করেন?",
      questionEn: "Do you accept bKash?",
      answerBn: "এই মুহূর্তে শুধুমাত্র ক্যাশ অন ডেলিভারি গ্রহণযোগ্য। শীঘ্রই বিকাশ ও নগদ যুক্ত হবে।",
      answerEn: "Currently we only accept Cash on Delivery. bKash and Nagad support is coming soon.",
    },
    {
      category: "returns",
      questionBn: "রিটার্ন পলিসি কী?",
      questionEn: "What is your return policy?",
      answerBn: "ডেলিভারির ২৪ ঘণ্টার মধ্যে সাপোর্টে যোগাযোগ করলে আমরা ফেরত/রিফান্ড প্রক্রিয়া করব।",
      answerEn: "Contact support within 24 hours of delivery to request a return or refund.",
    },
    {
      category: "ordering",
      questionBn: "অর্ডার কিভাবে ট্র্যাক করবো?",
      questionEn: "How do I track my order?",
      answerBn: "অর্ডার নম্বর ব্যবহার করে আমাদের ওয়েবসাইটের 'Track Order' পেজ থেকে স্ট্যাটাস দেখতে পারবেন।",
      answerEn: "Use your order number on our 'Track Order' page to see real-time status updates.",
    },
  ];

  for (const [i, f] of faqs.entries()) {
    const existing = await prisma.faq.findFirst({
      where: { category: f.category, questionEn: f.questionEn },
    });
    if (!existing) {
      await prisma.faq.create({
        data: { ...f, isPublished: true, sortOrder: i },
      });
      counts.faqs++;
    } else {
      counts.faqs++;
    }
  }
  console.log(`  ✓ ${counts.faqs} FAQs`);

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