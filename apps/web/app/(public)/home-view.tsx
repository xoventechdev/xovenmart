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
interface Category {
  id: string;
  slug: string;
  nameBn?: string;
  nameEn?: string;
  productCount?: number;
}
interface Product {
  id: string;
  slug: string;
}

export function HomeView({
  featured,
  categories,
  banners,
}: {
  featured: any[];
  categories: Category[];
  banners: Banner[];
}) {
  const { lang } = useTheme();
  const tw = useTwin();
  const delivery = useDeliveryPublicSafe();

  const featuredItems = featured ?? [];
  const categoryList = categories ?? [];
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
  const heroSubtitleBn = `${marketingLineBn} — ক্যাশ অন ডেলিভারি`;
  const heroSubtitleEn = `${marketingLineEn} — Cash on delivery`;
  const heroTitleBn = `তাজা পণ্য ${delivery.minutes} মিনিটে দোরগোড়ায়`;
  const heroTitleEn = `Fresh products at your door in ${delivery.minutes} minutes`;

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
                {pickName(bannerList[0], lang) || tw(heroTitleBn, heroTitleEn)}
              </h1>
              <p className="text-muted-foreground text-sm md:text-base mb-3">
                {pickField(bannerList[0], "subtitleBn", "subtitleEn", lang) || tw(heroSubtitleBn, heroSubtitleEn)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/category/grocery">
                    {tw("এখনই কিনুন", "Shop now")} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/deals">{tw("অফার দেখুন", "View offers")}</Link>
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
          {[
            { icon: Truck, bn: "দ্রুত ডেলিভারি", en: "30-min delivery", isDynamic: true },
            { icon: Shield, bn: "নিরাপদ পেমেন্ট", en: "Cash on Delivery" },
            { icon: Phone, bn: "২৪/৭ সাপোর্ট", en: "24/7 support" },
            { icon: Clock, bn: "তাজা পণ্য", en: "Fresh guarantee" },
          ].map((b: any, i) => {
            if (b.isDynamic) {
              // First badge uses admin-editable promise + marketing line.
              // The marketing line already includes the active zone list
              // substituted via the `{zones}` placeholder, so we render
              // it directly without a separate `zoneLine` calculation.
              const primary = lang === "en" ? delivery.labelEn : delivery.labelBn;
              const secondary =
                lang === "en" ? marketingLineEn : marketingLineBn;
              return (
                <div key={i} className="flex flex-col items-center gap-2">
                  <b.icon className="h-7 w-7 text-primary" />
                  <div>
                    <div className="font-semibold text-sm">{primary}</div>
                    <div className="text-xs text-muted-foreground">{secondary}</div>
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex flex-col items-center gap-2">
                <b.icon className="h-7 w-7 text-primary" />
                <div>
                  <div className="font-semibold text-sm">{lang === "bn" ? b.bn : b.en}</div>
                  <div className="text-xs text-muted-foreground">{lang === "bn" ? b.en : b.bn}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Categories */}
      <section className="container mx-auto px-4 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">{tw("ক্যাটাগরি", "Categories")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tw("আপনার প্রয়োজনীয় সব পণ্য এক জায়গায়", "Everything you need in one place")}
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            {tw("সব দেখুন", "See all")} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-2">
          {categoryList.slice(0, 12).map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className="group relative aspect-square bg-gradient-to-br from-ink-50 to-ink-100 dark:from-ink-800 dark:to-ink-900 rounded-lg p-1.5 flex flex-col items-center justify-center text-center hover:shadow-lg transition-all hover:-translate-y-0.5"
            >
              <div className="text-2xl leading-none mb-1">{getCategoryEmoji(c.slug)}</div>
              <div className="font-semibold text-[10px] leading-tight line-clamp-1">{pickName(c, lang)}</div>
              {(c.productCount ?? 0) > 0 && (
                <div className="text-[9px] text-muted-foreground leading-none mt-0.5">
                  {c.productCount}
                </div>
              )}
            </Link>
          ))}
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
            {featuredItems.slice(0, 12).map((p: Product) => (
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

function getCategoryEmoji(slug: string): string {
  const map: Record<string, string> = {
    grocery: "🍚",
    vegetables: "🥬",
    fruits: "�",
    dairy: "🥛",
    snacks: "🍪",
    beverages: "🥤",
    household: "🧴",
    "personal-care": "🧼",
    rice: "🍚",
    oil: "🛢️",
    spices: "🌶️",
    "fresh-veggies": "🥕",
    "leafy-greens": "🥬",
    "seasonal-fruits": "🥭",
    "local-fruits": "🍌",
    milk: "🥛",
    yogurt: "🍶",
    "chips-biscuits": "🍪",
    "soft-drinks": "🥤",
    cleaning: "🧹",
    skincare: "🧴",
  };
  return map[slug] || "📦";
}
