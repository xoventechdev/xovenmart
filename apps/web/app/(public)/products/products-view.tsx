"use client";

import Link from "next/link";
import { useTheme } from "@/lib/theme";

/**
 * Localized h1 + breadcrumb for the `/products` ("See all") route.
 *
 * Pure presentational — no fetch. Mirrors `<CategoryHeader>` so the
 * visual rhythm matches `/category/<slug>` (breadcrumb on top, then
 * big h1 + secondary line), but the secondary line is a static
 * tagline rather than the category's translated description.
 */
export function ProductsHeader() {
  const { lang } = useTheme();
  const homeBn = "হোম";
  const homeEn = "Home";
  const allBn = "সব পণ্য";
  const allEn = "All Products";
  const subBn = "জনপ্রিয় পণ্য থেকে শুরু করে সব পণ্য — ফিল্টার ও সর্ট করুন।";
  const subEn =
    "Everything we deliver, sorted by popularity — filter by price, stock, or deal.";

  return (
    <>
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
        <Link href="/" className="hover:text-primary">
          {lang === "en" ? homeEn : homeBn}
        </Link>
        <span>/</span>
        <span className="text-foreground">
          {lang === "en" ? allEn : allBn}
        </span>
      </nav>

      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">
          {lang === "en" ? allEn : allBn}
        </h1>
        <p className="text-sm text-muted-foreground">
          {lang === "en" ? subEn : subBn}
        </p>
      </div>
    </>
  );
}