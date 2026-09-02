"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Truck, Shield, Phone, Clock, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/product-card";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { useDeliveryPublicSafe, resolveMarketingLine } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { pickName, pickField } from "@/lib/locale-text";

interface Banner {
  id?: string;
  titleBn?: string;
  titleEn?: string;
  subtitleBn?: string;
  subtitleEn?: string;
  imageUrl?: string;
  linkUrl?: string;
}
interface Product {
  id: string;
  slug: string;
}

export function HomeView({
  featured,
  banners,
}: {
  featured: any[];
  banners: Banner[];
}) {
  const { lang } = useTheme();
  const tw = useTwin();
  const delivery = useDeliveryPublicSafe();
  const general = useGeneralSettingsSafe();

  // NOTE: The home page no longer renders a category grid — the header
  // nav (`SiteCategoryNav` in `components/public/site-header.tsx`) is now
  // the single source of truth for category browsing, driven by the same
  // `/catalog/categories?rootOnly=true` endpoint the home page used to
  // call. Removing this section eliminates a duplicated list and
  // guarantees the two never drift out of sync.
  const featuredItems = featured ?? [];
  const bannerList = banners ?? [];

  // Build the dynamic fallback subtitle for the hero (when the banner
  // doesn't override it): uses the admin-editable `marketingLine` template
  // with `{zones}` already substituted from the active delivery zones.
  const promiseBn = delivery.labelBn.replace(/\d+/g, String(delivery.minutes));
  const promiseEn = delivery.labelEn.replace(/\d+/g, String(delivery.minutes));
  const marketingLineEn = resolveMarketingLine(
    delivery.zones,
    "en",
    delivery.marketingLineBn,
    delivery.marketingLineEn,
  );
  const marketingLineBn = resolveMarketingLine(
    delivery.zones,
    "bn",
    delivery.marketingLineBn,
    delivery.marketingLineEn,
  );
  // Hero copy now comes from admin General Settings. The `{minutes}` and
  // `{marketingLine}` placeholders get substituted at render time so an
  // admin can change the deliver promise minutes without editing copy.
  const heroSubtitleBnTemplate = general.hero.subtitleBn.replace(
    /\{marketingLine\}/g,
    marketingLineBn,
  );
  const heroSubtitleEnTemplate = general.hero.subtitleEn.replace(
    /\{marketingLine\}/g,
    marketingLineEn,
  );
  const heroSubtitleBn =
    lang === "bn"
      ? heroSubtitleBnTemplate
      : heroSubtitleBnTemplate.replace(/ক্যাশ অন ডেলিভারি/g, "Cash on delivery");
  const heroSubtitleEn =
    lang === "en"
      ? heroSubtitleEnTemplate
      : heroSubtitleEnTemplate.replace(/Cash on delivery/g, "ক্যাশ অন ডেলিভারি");
  const heroTitleBnTemplate = general.hero.titleBn.replace(
    /\{minutes\}/g,
    String(delivery.minutes),
  );
  const heroTitleEnTemplate = general.hero.titleEn.replace(
    /\{minutes\}/g,
    String(delivery.minutes),
  );
  const heroTitleBn = heroTitleBnTemplate;
  const heroTitleEn = heroTitleEnTemplate;

  return (
    <div>
      {/* Hero banner */}
      {bannerList[0] && (
        <section className="bg-gradient-to-r from-emerald-50 to-amber-50 dark:from-emerald-950/20 dark:to-amber-950/20">
          <div className="container mx-auto px-4 py-4 md:py-6 grid md:grid-cols-2 gap-4 items-center">
            <div>
              <Badge variant="muted" className="mb-2 text-[10px]">
                {lang === "en" ? "Special discount for new customers" : "নতুন গ্রাহকদের জন্য বিশেষ ছাড়"}
              </Badge>
              <h1 className="text-2xl md:text-3xl font-bold mb-2 leading-tight">
                {pickName(bannerList[0], lang) ||
                  (lang === "en" ? heroTitleEn : heroTitleBn)}
              </h1>
              <p className="text-muted-foreground text-sm md:text-base mb-3">
                {pickField(bannerList[0], "subtitleBn", "subtitleEn", lang) ||
                  (lang === "en" ? heroSubtitleEn : heroSubtitleBn)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/category/grocery">
                    {tw(general.hero.ctaShopBn, general.hero.ctaShopEn)}{" "}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/deals">
                    {tw(general.hero.ctaOffersBn, general.hero.ctaOffersEn)}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="relative aspect-[16/9] md:aspect-[16/10]">
              {bannerList[0].imageUrl && (
                <Image
                  src={bannerList[0].imageUrl}
                  alt={pickName(bannerList[0], lang) || (lang === "en" ? "Hero" : "হিরো")}
                  fill
                  className="object-cover rounded-xl shadow-md"
                  priority
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* Trust badges */}
      <section className="border-y border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
        <div className="container mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {general.trustBadges.map((b, i) => {
            // Resolve the icon from the admin-provided key. Falls back to
            // a generic Badge icon if the admin sets something we don't
            // recognize (forward-compat).
            const Icon =
              b.icon === "Shield"
                ? Shield
                : b.icon === "Phone"
                  ? Phone
                  : b.icon === "Clock"
                    ? Clock
                    : Truck;
            const title = lang === "en" ? b.titleEn : b.titleBn;
            const body = lang === "en" ? b.en : b.bn;
            return (
              <div key={i} className="flex flex-col items-center gap-2">
                <Icon className="h-7 w-7 text-primary" />
                <div>
                  <div className="font-semibold text-sm">{title}</div>
                  <div className="text-xs text-muted-foreground">{body}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Featured products */}
      <section className="bg-ink-50 dark:bg-ink-900/50">
        <div className="container mx-auto px-4 py-10">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                <Tag className="h-6 w-6 text-red-500" />
                {tw("জনপ্রিয় পণ্য", "Popular Products")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {tw("সবচে�়ে বেশি বিক্রি হওয়া পণ্য", "Our most-ordered items")}
              </p>
            </div>
            <Link
              href="/"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              {tw("সব দেখুন", "See all")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
            {featuredItems.slice(0, general.homePage.popularCount).map((p: Product) => (
              <ProductCard key={p.id} product={p} variant="compact" />
            ))}
          </div>
        </div>
      </section>

      {/* Secondary banner */}
      {bannerList[1] && (
        <section className="container mx-auto px-4 py-10">
          <div className="relative aspect-[21/9] rounded-2xl overflow-hidden">
            {bannerList[1].imageUrl && (
              <Image
                src={bannerList[1].imageUrl}
                alt={pickName(bannerList[1], lang) || (lang === "en" ? "Promo" : "প্রমো")}
                fill
                className="object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center">
              <div className="px-8 text-white max-w-md">
                <h3 className="text-2xl md:text-3xl font-bold mb-2">
                  {pickName(bannerList[1], lang)}
                </h3>
                <p className="text-sm mb-4">{pickField(bannerList[1], "subtitleBn", "subtitleEn", lang)}</p>
                <Button asChild variant="secondary">
                  <Link href={bannerList[1].linkUrl || "/deals"}>
                    {tw("এখনই কিনুন", "Shop now")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
