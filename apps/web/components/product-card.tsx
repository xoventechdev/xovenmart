"use client";

import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { pickName } from "@/lib/locale-text";
import { toast } from "sonner";

/**
 * Compact product card used across home, category, search and deals pages.
 *
 * Design goals:
 *  - Small footprint: aspect-[4/3] image (not square), p-2 padding, single-line title clamp.
 *  - Variants: "default" | "compact" — controls whether to show discount badge + add button.
 *  - Localized: pulls the right name column from the product (nameBn vs nameEn)
 *    based on the live `useTheme().lang` toggle.
 */
export function ProductCard({
  product,
  variant = "default",
}: {
  product: any;
  variant?: "default" | "compact";
}) {
  const { lang } = useTheme();
  const tw = useTwin();
  const name = pickName(product, lang);

  const discount =
    product.mrp && product.salePrice && Number(product.mrp) > Number(product.salePrice)
      ? Math.round(
          ((Number(product.mrp) - Number(product.salePrice)) / Number(product.mrp)) * 100,
        )
      : 0;

  const salePrice = Number(product.salePrice) || 0;
  const mrp = Number(product.mrp) || 0;
  const inStock = product.stock == null ? true : Number(product.stock) > 0;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col bg-white dark:bg-ink-900 rounded-lg border border-ink-200 dark:border-ink-800 overflow-hidden hover:shadow-md hover:border-primary-300 dark:hover:border-primary-500 transition-all"
    >
      <div className="relative aspect-square bg-ink-50 dark:bg-ink-800">
        {product.image ? (
          <Image
            src={product.image}
            alt={name || (lang === "en" ? "Product" : "পণ্য")}
            fill
            className="object-cover group-hover:scale-105 transition-transform"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-400">
            {tw("ছবি নেই", "No image")}
          </div>
        )}
        {discount > 0 && (
          <Badge className="absolute top-1 left-1 bg-red-500 hover:bg-red-500 text-[9px] px-1 py-0">
            -{discount}%
          </Badge>
        )}
        {!inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-ink-900">
              {tw("স্টক নেই", "Out of stock")}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-1.5">
        <h3
          className="font-medium text-[11px] sm:text-xs text-ink-900 dark:text-ink-50 line-clamp-2 leading-tight"
          title={pickName(product, "bn")}
        >
          {name}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-xs sm:text-sm font-bold text-primary">
                ৳{salePrice.toLocaleString("en-IN")}
              </span>
              {mrp > salePrice && (
                <span className="text-[9px] sm:text-[10px] text-ink-400 line-through">
                  ৳{mrp.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            {product.unit && variant === "default" && (
              <div className="text-[9px] text-ink-500 leading-none mt-0.5">
                {tw("প্রতি", "per")} {product.unit}
              </div>
            )}
          </div>
          {variant === "default" && inStock && (
            <AddButton product={product} />
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Tiny "Add" pill that intercepts the parent <Link> click via stopPropagation,
 * adds to cart, and shows a Sonner toast. Falls back gracefully if cart store
 * is not available (e.g. SSR or non-customer page).
 */
function AddButton({ product }: { product: any }) {
  const { lang } = useTheme();
  const tw = useTwin();
  const name = pickName(product, lang);
  let add: ((item: any) => void) | null = null;
  try {
    const cart = useCart();
    add = cart.add;
  } catch {
    add = null;
  }

  return (
    <button
      type="button"
      aria-label={`${lang === "en" ? "Add" : "যোগ করুন"} ${name}`}
      title={lang === "en" ? "Add to cart" : "কার্টে যোগ করুন"}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm hover:bg-primary-700 active:scale-95 transition"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (add) {
          add({
            productId: product.id,
            slug: product.slug,
            nameBn: product.nameBn || "",
            nameEn: product.nameEn || "",
            image: product.image ?? null,
            unit: product.unit || "",
            unitPrice: Number(product.salePrice) || 0,
            mrp: Number(product.mrp) || undefined,
            qty: 1,
            weightGrams: product.weightGrams,
          });
          toast.success(
            lang === "en"
              ? `${name || "Item"} added to cart`
              : `${name || "পণ্য"} কার্টে যোগ হয়েছে`,
            {
              description: `৳${Number(product.salePrice).toLocaleString("en-IN")}`,
            },
          );
        }
      }}
    >
      <Plus className="h-3 w-3" />
    </button>
  );
}