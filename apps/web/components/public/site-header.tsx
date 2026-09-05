"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingCart, MapPin, Phone, LayoutGrid } from "lucide-react";
import { BrandBlock } from "@/components/brand-block";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/public/user-menu";
import { useTheme } from "@/lib/theme";
import { useCart } from "@/lib/cart";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { api } from "@/lib/api";
import { pickName } from "@/lib/locale-text";
import { getCategoryEmoji } from "@/lib/category-emoji";

/**
 * Public site header. Reads the live language from `useTheme().lang`
 * (kept in sync with `LangToggle` via the `xm-lang-change` event)
 * so every visible string switches when the user toggles BN ⇄ EN.
 */
export function SiteHeader() {
  const { lang } = useTheme();
  // Subscribe to total qty (sum of every item's qty). Re-runs only when
  // items[] changes so the badge stays in sync without manual work.
  const cartCount = useCart((s) => s.items.reduce((sum, i) => sum + i.qty, 0));
  // Admin-editable promise text + zone names. Falls back to the hardcoded
  // values when the API is unreachable or the page is rendered server-side.
  const delivery = useDeliveryPublicSafe();
  const general = useGeneralSettingsSafe();
  const promiseLabel = lang === "en" ? delivery.labelEn : delivery.labelBn;
  // "Zone A, Zone B, Zone C" — built live from the active zones the admin
  // has configured. If the API is unreachable or all zones are inactive,
  // show a generic phrase instead of fabricating location names.
  const locationLine =
    delivery.zones.length > 0
      ? delivery.zones
          .slice(0, 4)
          .map((z) => (lang === "en" ? z.nameEn : z.nameBn))
          .join(", ")
      : lang === "en"
        ? "all service areas"
        : "সকল সার্ভিস এলাকা";

  // Avoid hydration mismatch: cart lives in localStorage, so the SSR
  // snapshot is always 0. Only show the badge after the client has
  // rehydrated the persisted state.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Bilingual string pairs — most are now driven by admin General Settings
  // (store.name / header.searchPlaceholder / store.phone). Only the labels
  // that don't have admin keys stay hardcoded.
  const T = {
    brandEn: general.store.nameEn,
    brandBn: general.store.nameBn,
    searchEn: general.header.searchPlaceholderEn,
    searchBn: general.header.searchPlaceholderBn,
    trackEn: "Track Order",
    trackBn: "অর্ডার ট্র্যাক",
    cartEn: "Cart",
    cartBn: "কার্ট",
    phone: general.store.phone,
    shipEn: "🚚 30-min delivery",
    shipBn: "🚚 ৩০ মিনিটে ডেলিভারি",
  };
  const t = (bn: keyof typeof T, en: keyof typeof T) => (lang === "bn" ? T[bn] : T[en]);

  return (
    <>
      {/* Top utility bar */}
      <div className="bg-primary text-white text-xs">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {locationLine}
            </span>
            <span className="hidden md:flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {T.phone}
            </span>
          </div>
          <div className="text-xs">
            🚚 {promiseLabel.replace(/\d+/g, String(delivery.minutes))}
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="container mx-auto px-4 py-3 flex items-center gap-3 md:gap-4">
        {/* Brand block — logo OR text stack, never both.
            The smart logic lives in `components/brand-block.tsx`; the
            header just supplies the live brand payload + lang. */}
        <BrandBlock
          brand={{
            logoUrl: general.brand.logoUrl,
            logoDarkUrl: general.brand.logoDarkUrl,
            nameEn: general.store.nameEn,
            nameBn: general.store.nameBn,
            taglineEn: general.brand.taglineEn,
            taglineBn: general.brand.taglineBn,
          }}
          lang={lang}
          variant="header"
          className="flex items-center gap-2 shrink-0"
        />

        {/* Search */}
        <form
          action="/search"
          method="get"
          className="flex-1 max-w-2xl mx-2 md:mx-4"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder={t("searchBn", "searchEn")}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-ink-200 dark:border-ink-300 bg-white dark:bg-ink-100 dark:text-ink-900 dark:placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
        </form>

        {/* Right actions */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <Link
            href="/track"
            className="hidden md:flex items-center gap-1 text-sm hover:text-primary transition px-2"
          >
            <MapPin className="h-4 w-4" />
            {t("trackBn", "trackEn")}
          </Link>
          <Link
            href="/cart"
            aria-label={
              mounted && cartCount > 0
                ? lang === "en"
                  ? `Cart (${cartCount} items)`
                  : `কার্ট (${cartCount}টি পণ্য)`
                : t("cartBn", "cartEn")
            }
            className="relative p-2 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition"
          >
            <ShoppingCart className="h-7 w-7" />
            {mounted && cartCount > 0 && (
              <span
                key={cartCount /* re-mount triggers the pop-in animation */}
                className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white shadow ring-2 ring-white dark:ring-ink-900 animate-in zoom-in-50 fade-in duration-200"
              >
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          {/* Language + theme + user */}
          <LangToggle className="hidden sm:inline-flex" />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </>
  );
}

// NOTE: Previously this file declared a hardcoded `CATEGORY_LINKS` array
// of 8 fixed slugs. The header nav is now driven by live data from
// `/api/v1/catalog/categories?rootOnly=true` (see `SiteCategoryNav`
// below), so admin can add/rename/deactivate categories and they show
// up in the strip without a code change.

interface NavCategory {
  id: string;
  slug: string;
  nameBn?: string | null;
  nameEn?: string | null;
  imageUrl?: string | null;
  productCount?: number;
}

/**
 * Sticky header category strip.
 *
 * Renders a horizontally scrollable strip of cards, one per active ROOT
 * category fetched from `/catalog/categories?rootOnly=true`. The card
 * shows the category's image (or fallback emoji) + bilingual name. Click
 * navigates to the existing `/category/[slug]` page where related
 * products render below the fold.
 *
 * Lifecycle:
 *   - The list is fetched via React Query with `staleTime: 5min` so
 *     admin edits (add/rename/deactivate/reorder) propagate within 5
 *     minutes without an explicit invalidation.
 *   - The strip is a client component because the language preference
 *     lives in `localStorage` (no SSR-readable cookie), so the names
 *     must re-render via `useTheme().lang` after hydration to avoid a
 *     language mismatch on first paint.
 *   - Two static items are pinned: "All Products" at index 0 (→ `/`)
 *     and "🔥 Deals" at the end (→ `/deals`). They aren't categories
 *     so they stay hardcoded; the "Deals" link is rendered as a
 *     separate red chip to keep it visually distinct.
 *   - Skeleton shows 6 placeholder cards while the request is in
 *     flight so the strip never collapses to a single line.
 *   - On error or empty response, we render just the pinned
 *     "All Products" + "Deals" so the header is still usable.
 */
export function SiteCategoryNav() {
  const { lang } = useTheme();
  const pathname = usePathname();
  const label = (bn: string, en: string) => (lang === "bn" ? bn : en);

  // The horizontal category strip is only useful on shopping pages
  // (home, category, product, search, deals). Hide it on every other
  // public route — footer-style pages (about, contact, faq, privacy,
  // support, track), account / checkout / cart flow, and legal pages.
  // The list is kept as pathname-prefixes so any future
  // `/account/addresses/123` automatically hides too.
  const HIDDEN_PREFIXES = [
    "/about",
    "/track",
    "/faq",
    "/contact",
    "/legal",
    "/account",
    "/checkout",
    "/cart",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/orders",
    "/r/", // public referral landing
  ];
  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return null;
  }

  const { data, isLoading } = useQuery<NavCategory[]>({
    queryKey: ["public", "categories", "root"],
    queryFn: () => api.get("/catalog/categories?rootOnly=true"),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Drop categories with no products (recursively) — the backend
  // computes the count as self + all active descendants, so a parent
  // with products only in sub-categories still has productCount > 0
  // and stays visible. Pure-empty branches are hidden so shoppers
  // don't click into dead-end pages. The static "All Products" +
  // "Deals" chips at the edges of the strip are always present, so
  // the strip is never collapsed.
  const categories: NavCategory[] = (Array.isArray(data) ? data : []).filter(
    (c) => (c.productCount ?? 0) > 0,
  );
  // Active-page highlight: highlight the matching card via `usePathname()`.
  const isActive = (slug: string) => pathname === `/category/${slug}`;
  const isHome = pathname === "/";

  return (
    <nav
      aria-label={label("ক্যাটাগরি", "Categories")}
      className="border-t border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-900"
    >
      {/* Inline style for scrollbar-hide — Tailwind plugin isn't
          installed, so we hide the bar via vendor-prefixed CSS that
          works across Webkit (Chrome/Safari) and Firefox. Strip stays
          scrollable via swipe / trackpad. */}
      <div
        className="container mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Static "All Products" card (index 0) — always present so the
            user always has a way back to the full catalogue. */}
        <CategoryCard
          href="/"
          isActive={isHome}
          ariaLabel={label("সব পণ্য", "All Products")}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <div
            className={
              "mt-1 text-[11px] leading-tight line-clamp-1 max-w-[64px] text-center " +
              (isHome ? "font-bold text-primary" : "text-ink-700 dark:text-ink-200")
            }
          >
            {label("সব পণ্য", "All Products")}
          </div>
        </CategoryCard>

        {isLoading ? (
          // Skeleton — 6 placeholder cards matching the real card width.
          <>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="flex shrink-0 flex-col items-center animate-pulse"
              >
                <div className="h-14 w-14 rounded-lg bg-ink-200 dark:bg-ink-700" />
                <div className="mt-1 h-2.5 w-12 rounded bg-ink-200 dark:bg-ink-700" />
              </div>
            ))}
          </>
        ) : (
          // Dynamic cards — one per active root category from the DB.
          // Each card is a Link → /category/[slug] where the existing
          // category page renders related products below the fold.
          categories.map((c) => (
            <CategoryCard
              key={c.id}
              href={`/category/${c.slug}`}
              isActive={isActive(c.slug)}
              ariaLabel={pickName(c, lang) || c.slug}
            >
              <div className="relative h-14 w-14 overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800">
                {c.imageUrl ? (
                  <Image
                    src={c.imageUrl}
                    alt={pickName(c, lang) || c.slug}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl">
                    {getCategoryEmoji(c.slug)}
                  </div>
                )}
              </div>
              <div
                className={
                  "mt-1 text-[11px] leading-tight line-clamp-1 max-w-[64px] text-center " +
                  (isActive(c.slug)
                    ? "font-bold text-primary"
                    : "text-ink-700 dark:text-ink-200")
                }
              >
                {pickName(c, lang) || c.slug}
              </div>
            </CategoryCard>
          ))
        )}

        {/* Static "Deals" chip — always present at the tail, styled as a
            red pill so it reads as a promo, not a regular category. */}
        <Link
          href="/deals"
          className="ml-1 flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
        >
          🔥 {label("ছাড়", "Deals")}
        </Link>
      </div>
    </nav>
  );
}

/**
 * Single category card. Pulled out so the "All Products" static card
 * and the dynamic cards share the same hover/transition treatment
 * without duplicating Tailwind classes.
 */
function CategoryCard({
  href,
  isActive,
  ariaLabel,
  children,
}: {
  href: string;
  isActive: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={isActive ? "page" : undefined}
      className={
        "group flex shrink-0 flex-col items-center rounded-lg px-1 py-1 transition-all duration-150 " +
        (isActive
          ? "bg-primary-50 dark:bg-primary-900/30"
          : "hover:-translate-y-0.5 hover:bg-white dark:hover:bg-ink-800")
      }
      style={{ minWidth: 72 }}
    >
      {children}
    </Link>
  );
}
