"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Filter, SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";

type SortKey = "new" | "price_asc" | "price_desc" | "discount" | "popular";

interface Filters {
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  onSaleOnly: boolean;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = {
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  onSaleOnly: false,
  sort: "new",
};

/**
 * Client-side category view with working filter + sort.
 *
 * Strategy:
 *   - Initial 50 items are streamed from the server (SEO + first paint).
 *   - When user changes a filter, we re-fetch from `/catalog/products?…`
 *     via the public browser API (uses NEXT_PUBLIC_API_URL).
 *   - All filter state is local — keeping server component free of cookies.
 *   - All user-facing strings are bilingual — they switch live when the user
 *     toggles BN ⇄ EN via the site header.
 */
export function CategoryView({
  slug,
  initialItems,
}: {
  slug: string;
  initialItems: any[];
}) {
  const { lang } = useTheme();
  const tw = useTwin();
  const [items, setItems] = useState<any[]>(initialItems);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateFilter = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  // Compute price range from currently visible items (to seed min/max inputs)
  const priceBounds = useMemo(() => {
    if (items.length === 0) return { min: 0, max: 5000 };
    const prices = items.map((i) => Number(i.salePrice) || 0).filter((p) => p > 0);
    if (prices.length === 0) return { min: 0, max: 5000 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [items]);

  // Re-fetch from API when filters change
  const refetch = useCallback(
    async (f: Filters) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("category", slug);
        params.set("perPage", "50");
        if (f.sort) params.set("sort", f.sort);
        const apiUrl =
          (typeof window !== "undefined" &&
            (window as any).__NEXT_DATA__?.props?.pageProps?.apiUrl) ||
          process.env.NEXT_PUBLIC_API_URL ||
          "http://localhost:3001";
        const res = await fetch(`${apiUrl}/api/v1/catalog/products?${params}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        let list = (data.items || []) as any[];

        // Client-side: price range + on-sale + in-stock
        if (f.minPrice != null) list = list.filter((p) => Number(p.salePrice) >= (f.minPrice ?? 0));
        if (f.maxPrice != null) list = list.filter((p) => Number(p.salePrice) <= (f.maxPrice ?? Infinity));
        if (f.onSaleOnly)
          list = list.filter(
            (p) => Number(p.mrp) > 0 && Number(p.mrp) > Number(p.salePrice),
          );
        if (f.inStockOnly)
          list = list.filter((p) => p.stock == null || Number(p.stock) > 0);

        setItems(list);
      } catch {
        // Keep current items on failure
      } finally {
        setLoading(false);
      }
    },
    [slug],
  );

  // Debounced effect: re-fetch when sort changes (price range / stock / sale
  // are applied client-side so we only re-fetch for server-side sort).
  useEffect(() => {
    const t = setTimeout(() => refetch(filters), 250);
    return () => clearTimeout(t);
  }, [filters.sort, refetch, filters]);

  const activeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    if (filters.minPrice != null || filters.maxPrice != null) {
      const lo = filters.minPrice ?? 0;
      const hi = filters.maxPrice ?? "∞";
      chips.push({
        label: lang === "en" ? `Price: ৳${lo}–${hi}` : `মূল্য: ৳${lo}–${hi}`,
        clear: () => {
          updateFilter("minPrice", null);
          updateFilter("maxPrice", null);
        },
      });
    }
    if (filters.onSaleOnly) {
      chips.push({
        label: tw("শুধু ছাড়", "On sale only"),
        clear: () => updateFilter("onSaleOnly", false),
      });
    }
    if (filters.inStockOnly) {
      chips.push({
        label: tw("স্টকে আছে", "In stock only"),
        clear: () => updateFilter("inStockOnly", false),
      });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, lang]);

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-ink-800 dark:bg-ink-900/80">
        <div className="text-xs sm:text-sm text-muted-foreground">
          {loading
            ? tw("লোড হচ্ছে...", "Loading...")
            : lang === "en"
              ? `${items.length} products`
              : `${items.length}টি পণ্য`}
        </div>
        <div className="flex items-center gap-2">
          <SortDropdown value={filters.sort} onChange={(v) => updateFilter("sort", v)} />
          <Button
            variant={filterOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterOpen((v) => !v)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {tw("ফিল্টার", "Filter")}
            {activeChips.length > 0 && (
              <span className="ml-1 rounded-full bg-white/30 px-1.5 text-[10px] font-bold">
                {activeChips.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {activeChips.map((c, i) => (
            <button
              key={i}
              onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-200 dark:bg-primary-800 dark:text-primary-100 dark:hover:bg-primary-700"
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-xs text-muted-foreground hover:text-ink-900 underline"
          >
            {tw("সব মুছুন", "Clear all")}
          </button>
        </div>
      )}

      {/* Filter panel */}
      {filterOpen && (
        <div className="mb-4 rounded-lg border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <FilterPanel
            filters={filters}
            update={updateFilter}
            priceBounds={priceBounds}
          />
        </div>
      )}

      {/* Products grid — compact cards */}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} variant="compact" />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {tw(
            "এই ক্যাটাগরিতে কোনো পণ্য পাওয়া যায়নি",
            "No products found in this category",
          )}
        </div>
      )}
    </div>
  );
}

function FilterPanel({
  filters,
  update,
  priceBounds,
}: {
  filters: Filters;
  update: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  priceBounds: { min: number; max: number };
}) {
  const { lang } = useTheme();
  const tw = useTwin();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* Price range */}
      <div>
        <div className="mb-2 text-xs font-semibold text-ink-700 dark:text-ink-300">
          {tw("মূল্য পরিসীমা", "Price range")}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder={`${priceBounds.min}`}
            value={filters.minPrice ?? ""}
            onChange={(e) =>
              update("minPrice", e.target.value === "" ? null : Number(e.target.value))
            }
            className="w-full rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-100 dark:text-ink-900 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <span className="text-ink-400">–</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={`${priceBounds.max}`}
            value={filters.maxPrice ?? ""}
            onChange={(e) =>
              update("maxPrice", e.target.value === "" ? null : Number(e.target.value))
            }
            className="w-full rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-100 dark:text-ink-900 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          ৳{priceBounds.min} – ৳{priceBounds.max}
        </div>
      </div>

      {/* Toggles */}
      <div>
        <div className="mb-2 text-xs font-semibold text-ink-700 dark:text-ink-300">
          {tw("অন্যান্য", "Other")}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-ink-50 dark:hover:bg-ink-800">
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(e) => update("inStockOnly", e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-primary focus:ring-primary"
          />
          <span className="text-sm">{tw("শুধু স্টকে আছে", "In stock only")}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-ink-50 dark:hover:bg-ink-800">
          <input
            type="checkbox"
            checked={filters.onSaleOnly}
            onChange={(e) => update("onSaleOnly", e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-primary focus:ring-primary"
          />
          <span className="text-sm">{tw("শুধু ছাড়ে আছে", "On sale only")}</span>
        </label>
      </div>

      {/* Quick presets */}
      <div>
        <div className="mb-2 text-xs font-semibold text-ink-700 dark:text-ink-300">
          {tw("দ্রুত ফিল্টার", "Quick filters")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "৳১০০ এর নিচে", enLabel: "Under ৳100", min: null, max: 100 },
            { label: "৳১০০–৫০০", enLabel: "৳100–500", min: 100, max: 500 },
            { label: "৳৫০০–১০০০", enLabel: "৳500–1000", min: 500, max: 1000 },
            { label: "৳১০০০+", enLabel: "৳1000+", min: 1000, max: null },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => {
                update("minPrice", p.min);
                update("maxPrice", p.max);
              }}
              className="rounded-full border border-ink-200 px-2.5 py-1 text-xs hover:border-primary hover:bg-primary-50 dark:border-ink-700 dark:hover:bg-primary-900/30"
            >
              {lang === "en" ? p.enLabel : p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SortDropdown({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  const { lang } = useTheme();
  const [open, setOpen] = useState(false);
  const options: { key: SortKey; bn: string; en: string }[] = [
    { key: "new", bn: "নতুন আগে", en: "Newest first" },
    { key: "popular", bn: "জনপ্রিয়", en: "Popular" },
    { key: "price_asc", bn: "মূল্য: কম → বেশি", en: "Price: Low to High" },
    { key: "price_desc", bn: "মূল্য: বেশি → কম", en: "Price: High to Low" },
    { key: "discount", bn: "সর্বোচ্চ ছাড়", en: "Highest discount" },
  ];
  const current =
    (options.find((o) => o.key === value) &&
      (lang === "en"
        ? options.find((o) => o.key === value)!.en
        : options.find((o) => o.key === value)!.bn)) ||
    (lang === "en" ? "Sort" : "সর্ট");
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-xs sm:text-sm hover:border-primary dark:border-ink-700 dark:bg-ink-900"
      >
        <Filter className="h-3.5 w-3.5" />
        <span>{current}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 min-w-[160px] rounded-md border border-ink-200 bg-white py-1 shadow-lg dark:border-ink-700 dark:bg-ink-900">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs sm:text-sm hover:bg-ink-50 dark:hover:bg-ink-800 ${
                  o.key === value ? "font-semibold text-primary" : ""
                }`}
              >
                {lang === "en" ? o.en : o.bn}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}