"use client";

import { Search } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";

/**
 * Client view for the search results page. Server-side data fetch lives in
 * `page.tsx`. This component re-renders bilingual copy when the user toggles
 * the language.
 */
export function SearchView({ q, items }: { q: string; items: any[] }) {
  const { lang } = useTheme();
  const tw = useTwin();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">
          {tw("পণ্য খুঁজুন", "Find products")}
        </h1>
        <form action="/search" method="get" className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={tw(
              "যেমন: চাল, তেল, সাবান...",
              "e.g. rice, oil, soap...",
            )}
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-100 dark:text-ink-900 dark:placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
        </form>
      </div>

      {q && (
        <p className="text-sm text-muted-foreground mb-4">
          {lang === "en"
            ? `${items.length} result${items.length === 1 ? "" : "s"} found for "${q}"`
            : `"${q}" এর জন্য ${items.length}টি ফলাফল পাওয়া গেছে`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((p: any) => (
          <ProductCard key={p.id} product={p} variant="compact" />
        ))}
      </div>

      {q && items.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          {tw("কোনো পণ্য পাওয়া যায়নি", "No products found")}
        </div>
      )}
    </div>
  );
}