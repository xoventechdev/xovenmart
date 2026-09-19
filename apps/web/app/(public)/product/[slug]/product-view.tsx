"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Tag, Truck, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettings } from "@/lib/use-general-settings";
import { pickName, pickDescription } from "@/lib/locale-text";
import { cn } from "@/lib/utils";
import { AddToCartButton } from "./add-to-cart";
import { SameCategoryTopSellers } from "./same-category-top-sellers";

/**
 * Image gallery for the product detail page.
 *
 * Renders a large main image with optional prev/next arrows + a
 * thumbnail strip when the product has more than one image. Falls
 * back to the legacy single `product.image` string for back-compat
 * with any older API responses / cached pages.
 *
 * Why a separate component:
 *   - The selected-image state lives here so the parent stays simple.
 *   - The thumbnail strip uses keyboard-arrow navigation between
 *     active thumbs (a11y) and works without JS (links would, but
 *     we keep state-driven).
 */
function ProductGallery({
  images,
  legacyImage,
  productName,
}: {
  images?: { url: string; altBn?: string | null; altEn?: string | null }[];
  legacyImage?: string | null;
  productName: string;
}) {
  const { lang } = useTheme();
  // Normalise the two possible shapes into one ordered list.
  const list: { url: string; alt?: string | null }[] = useMemo(() => {
    if (Array.isArray(images) && images.length > 0) {
      return images.map((im) => ({
        url: im.url,
        alt:
          lang === "en"
            ? im.altEn || im.altBn || productName
            : im.altBn || im.altEn || productName,
      }));
    }
    if (legacyImage) return [{ url: legacyImage, alt: productName }];
    return [];
  }, [images, legacyImage, lang, productName]);

  const [active, setActive] = useState(0);

  // Reset selection if the gallery shrinks (e.g. product update).
  useEffect(() => {
    if (active >= list.length) setActive(0);
  }, [active, list.length]);

  if (list.length === 0) {
    // No image at all — render an empty placeholder so the layout
    // doesn't collapse and the right column stays aligned.
    return (
      <div className="bg-white dark:bg-ink-900 rounded-2xl p-4 border border-ink-200 dark:border-ink-800">
        <div className="relative aspect-square bg-ink-100 dark:bg-ink-800 rounded-xl flex items-center justify-center text-ink-400 text-sm">
          {/* "No image" placeholder. Bilingual label. */}
          {lang === "bn" ? "কোনো ছবি নেই" : "No image available"}
        </div>
      </div>
    );
  }

  const current = list[Math.min(active, list.length - 1)];
  const hasMany = list.length > 1;
  const goPrev = () =>
    setActive((i) => (i - 1 + list.length) % list.length);
  const goNext = () => setActive((i) => (i + 1) % list.length);

  return (
    <div className="bg-white dark:bg-ink-900 rounded-2xl p-4 border border-ink-200 dark:border-ink-800">
      {/* Main image */}
      <div className="relative aspect-square">
        <Image
          src={current.url}
          alt={current.alt ?? productName}
          fill
          className="object-cover rounded-xl"
          priority
          // `unoptimized` so the browser fetches the API-hosted image
          // directly instead of round-tripping through /_next/image.
          // Product photos are large (2 MB+); the Next.js optimizer
          // would re-encode them to no useful end and adds latency.
          unoptimized
        />
        {/* Prev/next overlay buttons. Only when there's more than one
            image — keeps the UX clean for single-image products. */}
        {hasMany && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={lang === "bn" ? "আগের ছবি" : "Previous image"}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-ink-900/80 hover:bg-white dark:hover:bg-ink-900 rounded-full p-1.5 shadow border border-ink-200 dark:border-ink-700 transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={lang === "bn" ? "পরের ছবি" : "Next image"}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-ink-900/80 hover:bg-white dark:hover:bg-ink-900 rounded-full p-1.5 shadow border border-ink-200 dark:border-ink-700 transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* Position indicator, e.g. "2 / 5". Tiny chip bottom-right. */}
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              {active + 1} / {list.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip. Only render when there's more than one
          image so single-image products stay visually clean. */}
      {hasMany && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">
          {list.map((im, i) => {
            const isActive = i === active;
            return (
              <button
                key={im.url + i}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`${lang === "bn" ? "ছবি" : "Image"} ${i + 1}`}
                onClick={() => setActive(i)}
                className={cn(
                  "relative shrink-0 h-16 w-16 rounded-lg overflow-hidden border-2 transition",
                  isActive
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-ink-200 dark:border-ink-700 hover:border-primary/60",
                )}
              >
                <Image
                  src={im.url}
                  alt={im.alt ?? productName}
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Client view for the product detail page. Everything that needs to react
 * to the language toggle lives here:
 *  - h1 (product name) and breadcrumb use pickName()
 *  - description uses pickDescription()
 *  - "Stock", "Description", "Quantity", trust badges, etc. are bilingual
 *
 * Phase 1 variants: when `product.hasVariants === true`, the price card
 * is replaced with a variant picker. The currently-selected variant is
 * lifted into state here and passed to `AddToCartButton`. The default
 * selection comes from the server (`displayVariantId`) — first variant
 * with stock, falling back to the first by sortOrder.
 */
export function ProductView({ product }: { product: any }) {
  const { lang } = useTheme();
  const tw = useTwin();
  const delivery = useDeliveryPublicSafe();
  const settings = useGeneralSettings();
  const mins = delivery.minutes;
  const promiseBn = delivery.labelBn.replace(/\d+/g, String(mins));
  const promiseEn = delivery.labelEn.replace(/\d+/g, String(mins));

  const name = pickName(product, lang);
  const description = pickDescription(product, lang);
  const categoryName = product.category ? pickName(product.category, lang) : "";
  const categorySlug = product.category?.slug ?? null;

  const hasVariants = product.hasVariants === true;
  // Variant list comes pre-sorted from the backend. Default selection is
  // server-supplied (first variant with stock, else first by sortOrder).
  const variants: any[] = Array.isArray(product.variants) ? product.variants : [];
  const initialSelectedId =
    product.displayVariantId ?? (variants[0]?.id ?? null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialSelectedId,
  );
  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? null,
    [variants, selectedVariantId],
  );

  // Effective price/mrp/stock — derived from the selected variant when
  // in variant mode, otherwise from the product scalars. The serializer
  // already mirrors the default variant into the top-level fields so
  // SSR matches, but on the client we recompute as the user picks.
  const effectiveMrp = hasVariants
    ? selectedVariant
      ? Number(selectedVariant.priceMrp)
      : Number(product.mrp)
    : Number(product.mrp);
  const effectiveSale = hasVariants
    ? selectedVariant
      ? Number(selectedVariant.priceSale)
      : Number(product.salePrice)
    : Number(product.salePrice);
  const discount =
    effectiveMrp > 0 && effectiveSale > 0
      ? Math.round(((effectiveMrp - effectiveSale) / effectiveMrp) * 100)
      : 0;

  const trustBadges = [
    {
      icon: Truck,
      bn: "দ্রুত ডেলিভারি",
      bnSub: `${mins} মিনিটে`,
      en: "Fast delivery",
      enSub: `in ${mins} min`,
    },
    { icon: Shield, bn: "নিরাপদ পেমেন্ট", bnSub: "COD + bKash", en: "Safe payment", enSub: "COD + bKash" },
  ];

  // API only exposes the `inStock` boolean (not the raw stock count) so
  // customers can't infer exact inventory. In variant mode the per-variant
  // boolean drives the badge — out-of-stock variants get an "Out of stock"
  // chip + the add-to-cart button is disabled (handled inside AddToCartButton).
  const isInStock = hasVariants
    ? selectedVariant
      ? selectedVariant.inStock === true
      : false
    : product.inStock !== false;
  const stockBadge = isInStock
    ? `✓ ${tw("স্টকে আছে", "In stock")}`
    : `✗ ${tw("স্টকে নেই", "Out of stock")}`;

  return (
    <>
      <div className="grid md:grid-cols-2 gap-8">
      {/* Image gallery. The API already returns the full `images[]`
          array (sorted by sortOrder) on the detail serializer, so we
          just feed it to the gallery component. `product.image` is
          kept as a legacy fallback. */}
      <ProductGallery
        images={product.images}
        legacyImage={product.image}
        productName={name}
      />

      {/* Details */}
      <div>
        {product.category && (
          <Link
            href={`/category/${product.category.slug}`}
            className="text-xs text-primary hover:underline"
          >
            {categoryName}
          </Link>
        )}
        <h1 className="text-2xl md:text-3xl font-bold mt-1 mb-2">{name}</h1>
        {(product.nameBn && product.nameEn) && (
          <p className="text-sm text-muted-foreground mb-3">
            {lang === "en" ? product.nameBn : product.nameEn}
          </p>
        )}

        {/* Price + variant picker (Phase 1).
            When the product has variants the picker lives inside the price
            card so the customer sees the price change as they click a
            variant chip. Legacy single-SKU products render the old layout
            verbatim. */}
        <div className="bg-ink-50 dark:bg-ink-900 rounded-xl p-4 mb-4">
          {hasVariants && variants.length > 0 ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  {tw("ভ্যারিয়েন্ট", "Variant")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const active = v.id === selectedVariantId;
                    const oos = v.inStock !== true;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariantId(v.id)}
                        className={
                          "px-3 py-2 rounded-lg border text-sm font-medium transition " +
                          (active
                            ? "bg-primary text-white border-primary shadow"
                            : oos
                              ? "bg-white dark:bg-ink-800 text-ink-400 border-ink-200 dark:border-ink-700 line-through"
                              : "bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100 border-ink-200 dark:border-ink-700 hover:border-primary")
                        }
                        aria-pressed={active}
                        aria-label={v.name}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-primary">
                  ৳{effectiveSale.toLocaleString("en-IN")}
                </span>
                {effectiveMrp > effectiveSale && (
                  <>
                    <span className="text-lg text-muted-foreground line-through">
                      ৳{effectiveMrp.toLocaleString("en-IN")}
                    </span>
                    <Badge className="bg-red-500 hover:bg-red-500">
                      <Tag className="h-3 w-3 mr-1" /> -{discount}% {tw("ছাড়", "off")}
                    </Badge>
                  </>
                )}
              </div>
              {!selectedVariant && (
                <div className="text-xs text-muted-foreground">
                  {tw("একটি ভ্যারিয়েন্ট নির্বাচন করুন", "Please select a variant")}
                </div>
              )}
              {/* In variant mode the selected chip name (e.g. "500 গ্রাম")
                  already tells the customer the unit, so we deliberately
                  don't render "per <unit>" here — that line is redundant
                  next to the chip. Legacy single-SKU products still get
                  the "per <unit>" line in the branch below. */}
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-primary">
                  ৳{Number(product.salePrice).toLocaleString("en-IN")}
                </span>
                {product.mrp && Number(product.mrp) > Number(product.salePrice) && (
                  <>
                    <span className="text-lg text-muted-foreground line-through">
                      ৳{Number(product.mrp).toLocaleString("en-IN")}
                    </span>
                    <Badge className="bg-red-500 hover:bg-red-500">
                      <Tag className="h-3 w-3 mr-1" /> -{discount}% {tw("ছাড়", "off")}
                    </Badge>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {tw("প্রতি", "per")} {product.unit}
              </div>
            </>
          )}
        </div>

        {/* Description */}
        {description && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2">{tw("বিবরণ", "Description")}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          </div>
        )}

        {/* Stock */}
        <div className="mb-4">
          {isInStock ? (
            <Badge variant="outline" className="text-emerald-600 border-emerald-600">
              {stockBadge}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-600 border-red-600">
              {stockBadge}
            </Badge>
          )}
        </div>

        {/* Add to cart — passes the selected variant down. */}
        <AddToCartButton product={product} selectedVariant={selectedVariant} />

        {/* Trust badges */}
        <div className="grid grid-cols-2 gap-3 mt-6 text-xs">
          {trustBadges.map((b, i) => {
            const Icon = b.icon;
            return (
              <div key={i} className="flex items-center gap-2 p-3 bg-ink-50 dark:bg-ink-900 rounded-lg">
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-semibold">{lang === "en" ? b.en : b.bn}</div>
                  <div className="text-muted-foreground">{lang === "en" ? b.enSub : b.bnSub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top sellers from same category. Spans full grid width (md+)
          by being placed AFTER the grid container closes below. We
          render it as a sibling to the 2-col product grid so the cards
          line up under both the image column and the details column
          with consistent left/right margins. The cap is admin-controlled
          via settings.productPage.sameCategoryCount (default 10, max
          50 — same bounds as the home page popular carousel). */}
    </div>

    <SameCategoryTopSellers
      productId={product.id}
      categorySlug={categorySlug}
      categoryName={categoryName}
      limit={settings.productPage.sameCategoryCount}
    />
    </>
  );
}

/**
 * Bilingual breadcrumb. Pure client component.
 */
export function ProductBreadcrumb({ product }: { product: any }) {
  const { lang } = useTheme();
  const tw = useTwin();
  const name = pickName(product, lang);
  const categoryName = product.category ? pickName(product.category, lang) : "";

  return (
    <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
      <Link href="/" className="hover:text-primary">
        {tw("হোম", "Home")}
      </Link>
      <span>/</span>
      {product.category && (
        <>
          <Link
            href={`/category/${product.category.slug}`}
            className="hover:text-primary"
          >
            {categoryName}
          </Link>
          <span>/</span>
        </>
      )}
      <span className="text-foreground line-clamp-1">{name}</span>
    </nav>
  );
}
