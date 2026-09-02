"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Home, Tag, XCircle } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { pickName } from "@/lib/locale-text";

/**
 * Friendly fallback for `/product/[slug]` when the product exists but has
 * been deactivated by an admin (`isActive === false`). Renders the
 * product's name + image (so the visitor sees what they came for), a
 * bilingual explanation, and a list of related products from the same
 * category so they can recover without bouncing.
 *
 * Replaces what used to be a dead-end Next.js 404 page — that happened
 * because the API used to throw NotFoundException for inactive products,
 * and a saved URL pointed at the row was impossible to tell apart from a
 * typo'd URL. Now the API returns the row (with `isActive: false`) and
 * this component handles it gracefully.
 *
 * The related-products fetch is a client-side call to the public
 * `/catalog/products?category=<slug>` endpoint — runs once on mount,
 * keeps the server component free of fetches it can't stream.
 */
export function ProductUnavailable({ product }: { product: any }) {
  const { lang } = useTheme();
  const tw = useTwin();
  const name = pickName(product, lang);
  const category = product.category;
  const categoryName = category ? pickName(category, lang) : "";
  const categorySlug = category?.slug;

  const [related, setRelated] = useState<any[] | null>(null);

  useEffect(() => {
    if (!categorySlug) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    const apiUrl =
      (typeof window !== "undefined" &&
        (window as any).__NEXT_DATA__?.props?.pageProps?.apiUrl) ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3001";
    fetch(`${apiUrl}/api/v1/catalog/products?category=${categorySlug}&perPage=8`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        // Filter out the deactivated product itself just in case the
        // backend ever returns it (defense in depth).
        const items = (d?.items ?? []).filter((p: any) => p.id !== product.id);
        setRelated(items);
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categorySlug, product.id]);

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Breadcrumb — mirrors the normal product breadcrumb but the
          current page is the unavailability notice, not the product itself. */}
      <nav className="text-sm text-ink-500 mb-4 flex items-center gap-2">
        <Link href="/" className="hover:text-primary inline-flex items-center gap-1">
          <Home className="h-3.5 w-3.5" />
          {lang === "en" ? "Home" : "হোম"}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
        {categorySlug ? (
          <Link
            href={`/category/${categorySlug}`}
            className="hover:text-primary"
          >
            {categoryName || categorySlug}
          </Link>
        ) : (
          <span>{categoryName}</span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
        <span className="text-ink-700 dark:text-ink-200">{name || product.slug}</span>
      </nav>

      {/* Hero — product name + image + unavailability message */}
      <div className="rounded-xl border border-ink-200 bg-white dark:border-ink-300 dark:bg-ink-50 overflow-hidden">
        <div className="grid md:grid-cols-[200px_1fr] gap-4 p-5">
          {/* Product image — show it so the visitor can see what they
              came for. Falls back to a package icon when the row has no
              images attached. */}
          <div className="relative aspect-square w-full max-w-[200px] overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-200">
            {product.images?.[0]?.url ? (
              <Image
                src={product.images[0].url}
                alt={name || product.slug}
                fill
                sizes="200px"
                className="object-cover opacity-70 grayscale"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink-400">
                <Tag className="h-12 w-12" />
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center">
            <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-danger-100 px-2.5 py-1 text-xs font-semibold text-danger-700 dark:bg-danger-500/20 dark:text-danger-100">
              <XCircle className="h-3.5 w-3.5" />
              {tw("এই মুহূর্তে পাওয়া যাচ্ছে না", "Currently unavailable")}
            </div>

            <h1 className="mt-3 text-2xl font-bold text-ink-900 dark:text-ink-900">
              {name || product.slug}
            </h1>

            {categorySlug && (
              <p className="mt-1 text-sm text-ink-500">
                {tw("ক্যাটাগরি", "Category")}:{" "}
                <Link
                  href={`/category/${categorySlug}`}
                  className="text-primary hover:underline"
                >
                  {categoryName || categorySlug}
                </Link>
              </p>
            )}

            <p className="mt-3 text-sm text-ink-700 dark:text-ink-200">
              {tw(
                "এই পণ্যটি বর্তমানে আমাদের ক্যাটালগ থেকে সরিয়ে নেওয়া হয়েছে। আপনি একই ক্যাটাগরির অন্যান্য পণ্য দেখতে পারেন অথবা আমাদের হোমপেজ থেকে কেনাকাটা চালিয়ে যেতে পারেন।",
                "This product has been removed from our catalogue. You can browse other items from the same category or continue shopping from the homepage.",
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {categorySlug && (
                <Button asChild>
                  <Link href={`/category/${categorySlug}`}>
                    {tw("এই ক্যাটাগরি দেখুন", "Browse this category")}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/">
                  {tw("হোমপেজে যান", "Go to homepage")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Related products — the recovery path. */}
      {categorySlug && (
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-bold">
              {tw("অনুরূপ পণ্য", "You might also like")}
            </h2>
            <Link
              href={`/category/${categorySlug}`}
              className="text-xs font-semibold text-primary-700 hover:underline"
            >
              {tw("সব দেখুন →", "View all →")}
            </Link>
          </div>

          {related == null ? (
            // Loading state — quiet placeholder, no spinners, so the page
            // never feels broken while the request is in flight.
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-48 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-200"
                />
              ))}
            </div>
          ) : related.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-200 bg-ink-50 p-6 text-center text-sm text-ink-500 dark:border-ink-300 dark:bg-ink-100">
              {tw(
                "এই মুহূর্তে এই ক্যাটাগরিতে আর কোনো পণ্য নেই।",
                "No other products available in this category right now.",
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} variant="default" />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
