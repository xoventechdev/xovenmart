"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ShoppingCart, MapPin, Phone } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/public/user-menu";
import { useTheme } from "@/lib/theme";
import { useCart } from "@/lib/cart";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";

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

  // Bilingual string pairs — DB keys can override later via I18nProvider.
  const T = {
    brandEn: "XovenMart",
    brandBn: "জোভেন্টমার্ট",
    searchEn: "Search products... e.g. rice, oil, vegetables",
    searchBn: "পণ্য খুঁজুন... যেমন চাল, তেল, সবজি",
    trackEn: "Track Order",
    trackBn: "অর্ডার ট্র্যাক",
    cartEn: "Cart",
    cartBn: "কার্ট",
    phone: "+৮৮০১৭১০০০০০০",
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
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <BrandMark size={40} />
          <div>
            <div className="text-lg font-bold text-primary">{t("brandBn", "brandEn")}</div>
            <div className="text-xs text-muted-foreground -mt-1 hidden sm:block">
              {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
            </div>
          </div>
        </Link>

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
            <ShoppingCart className="h-6 w-6" />
            {mounted && cartCount > 0 && (
              <span
                key={cartCount /* re-mount triggers the pop-in animation */}
                className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-white dark:ring-ink-900 animate-in zoom-in-50 fade-in duration-200"
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

const CATEGORY_LINKS = [
  { href: "/", bn: "সব পণ্য", en: "All Products" },
  { href: "/category/grocery", bn: "মুদিখানা", en: "Grocery" },
  { href: "/category/vegetables", bn: "সবজি", en: "Vegetables" },
  { href: "/category/fruits", bn: "�লমূল", en: "Fruits" },
  { href: "/category/dairy", bn: "দুগ্ধজাত", en: "Dairy" },
  { href: "/category/snacks", bn: "স্ন্যাক্স", en: "Snacks" },
  { href: "/category/beverages", bn: "পানীয়", en: "Beverages" },
  { href: "/category/household", bn: "গৃহস্থালি", en: "Household" },
  { href: "/category/personal-care", bn: "ব্যক্তিগত যত্ন", en: "Personal Care" },
];

export function SiteCategoryNav() {
  const { lang } = useTheme();
  const label = (bn: string, en: string) => (lang === "bn" ? bn : en);

  return (
    <nav className="border-t border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-900">
      <div className="container mx-auto px-4 py-2 flex items-center gap-6 overflow-x-auto text-sm">
        {CATEGORY_LINKS.map((c, i) => (
          <Link
            key={c.href}
            href={c.href}
            className={
              i === 0
                ? "font-semibold text-primary whitespace-nowrap"
                : "hover:text-primary whitespace-nowrap"
            }
          >
            {label(c.bn, c.en)}
          </Link>
        ))}
        <Link
          href="/deals"
          className="text-red-600 font-semibold whitespace-nowrap"
        >
          🔥 {label("ছাড়", "Deals")}
        </Link>
      </div>
    </nav>
  );
}
