"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";

/**
 * "Top sellers from same category" rail for the product detail page.
 *
 * Rendered directly under the product card + cart button on
 * `/product/[slug]`. Calls the public
 * `GET /catalog/products/popular?category=<slug>&exclude=<id>` endpoint,
 * which is sorted by sales (most-ordered first) and capped at the
 * admin-configured `productPage.sameCategoryCount` setting (default 10).
 *
 * Behaviour:
 *  - Returns null when the product has no category (rare — most
 *    catalog rows do). Nothing to recommend.
 *  - Shows a quiet skeleton (4 cards) while loading — same pattern as
 *    `<ProductUnavailable>`'s related-products rail, so the page never
 *    feels broken during the request.
 *  - Shows a soft "no items" state only when the request resolves with
 *    zero items. Hedged language ("no other items right now") so a new
 *    visitor doesn't think the category is dead.
 *
 * Skeleton uses 4 cells rather than the admin-configured count because
 * we don't know the count until the request resolves. The first paint
 * is a small, consistent block.
 */
export function SameCategoryTopSellers({
  productId,
  categorySlug,
  categoryName,
  limit,
}: {
  productId: string;
  categorySlug: string | null | undefined;
  categoryName: string;
  /** Admin-configured cap. If the API returns fewer items than this we
   *  just render what we got; if the API returns more (defense in depth)
   *  we slice the first N. */
  limit: number;
}) {
  const { lang } = useTheme();
  const tw = useTwin();
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    if (!categorySlug) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const apiUrl =
      (typeof window !== "undefined" &&
        (window as any).__NEXT_DATA__?.props?.pageProps?.apiUrl) ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001";
    const url = `${apiUrl}/api/v1/catalog/products/popular?category=${encodeURIComponent(
      categorySlug,
    )}&exclude=${encodeURIComponent(productId)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const fetched: any[] = d?.items ?? [];
        // Slice to the admin-configured cap. Defense in depth: the
        // backend already applies the cap server-side, but if a future
        // change accidentally loosens that, the rail won't suddenly
        // double in length on the user's screen.
        const sliced = fetched.slice(0, Math.max(1, limit));
        setItems(sliced);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categorySlug, productId, limit]);

  // No category — nothing to recommend.
  if (!categorySlug) return null;

  return (
    <section className="mt-10 border-t border-ink-200 pt-8 dark:border-ink-300">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold">
            {tw("এই ক্যাটাগরির জনপ্রিয় পণ্য", "Top sellers in this category")}
          </h2>
          {categoryName && (
            <p className="mt-0.5 text-xs text-ink-500">
              {tw("ক্যাটাগরি", "Category")}:{" "}
              <span className="font-semibold">{categoryName}</span>
            </p>
          )}
        </div>
        <Link
          href={`/category/${categorySlug}`}
          className="text-xs font-semibold text-primary-700 hover:underline"
        >
          {tw("সব দেখুন →", "View all →")}
        </Link>
      </div>

      {items == null ? (
        // Loading state — 4 placeholder cards. We don't know the cap yet
        // (the setting arrives via the settings hook, but we want the
        // request to fire as soon as the page mounts, not after the
        // settings hook resolves), so 4 is a reasonable middle ground
        // that matches the home page rail.
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-200"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 p-6 text-center text-sm text-ink-500 dark:border-ink-300 dark:bg-ink-100">
          {tw(
            "এই মুহূর্তে এই ক্যাটাগরিতে অন্য কোনো পণ্য নেই।",
            "No other products available in this category right now.",
          )}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} variant="default" />
          ))}
        </div>
      )}
    </section>
  );
}
