"use client";

import Link from "next/link";
import Image from "next/image";
import { Tag, Truck, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { pickName, pickDescription } from "@/lib/locale-text";
import { AddToCartButton } from "./add-to-cart";

/**
 * Client view for the product detail page. Everything that needs to react
 * to the language toggle lives here:
 *  - h1 (product name) and breadcrumb use pickName()
 *  - description uses pickDescription()
 *  - "Stock", "Description", "Quantity", trust badges, etc. are bilingual
 */
export function ProductView({ product }: { product: any }) {
  const { lang } = useTheme();
  const tw = useTwin();
  const delivery = useDeliveryPublicSafe();
  const mins = delivery.minutes;
  const promiseBn = delivery.labelBn.replace(/\d+/g, String(mins));
  const promiseEn = delivery.labelEn.replace(/\d+/g, String(mins));

  const name = pickName(product, lang);
  const description = pickDescription(product, lang);
  const categoryName = product.category ? pickName(product.category, lang) : "";

  const discount =
    product.mrp && product.salePrice
      ? Math.round(
          ((Number(product.mrp) - Number(product.salePrice)) / Number(product.mrp)) * 100,
        )
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

  const stockBadge = product.stockQty > 0
    ? `✓ ${tw("স্টকে আছে", "In stock")}`
    : `✗ ${tw("স্টকে নেই", "Out of stock")}`;

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* Image */}
      <div className="bg-white dark:bg-ink-900 rounded-2xl p-4 border border-ink-200 dark:border-ink-800">
        <div className="relative aspect-square">
          {product.image && (
            <Image
              src={product.image}
              alt={name}
              fill
              className="object-cover rounded-xl"
              priority
            />
          )}
        </div>
      </div>

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

        {/* Price */}
        <div className="bg-ink-50 dark:bg-ink-900 rounded-xl p-4 mb-4">
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
          {product.stockQty > 0 ? (
            <Badge variant="outline" className="text-emerald-600 border-emerald-600">
              {stockBadge}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-600 border-red-600">
              {stockBadge}
            </Badge>
          )}
        </div>

        {/* Add to cart */}
        <AddToCartButton product={product} />

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
    </div>
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
