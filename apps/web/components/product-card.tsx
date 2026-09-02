"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { pickName } from "@/lib/locale-text";
import { validateSingleProduct } from "@/lib/cart-validate";
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
  // Prefer `inStock` (the API's curated boolean). Fall back to a stock-count
  // check for any legacy payload that still carries `stock` directly.
  const inStock =
    product.inStock === false
      ? false
      : product.inStock === true
        ? true
        : product.stock == null
          ? true
          : Number(product.stock) > 0;

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
          <Badge className="absolute top-1 left-1 bg-red-500 hover:bg-red-500 text-[10px] sm:text-xs px-1.5 py-0.5 font-bold">
            -{discount}%
          </Badge>
        )}
        {!inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded bg-white/90 px-2 py-1 text-xs sm:text-sm font-bold text-ink-900">
              {tw("স্টক নেই", "Out of stock")}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-1.5">
        <h3
          className="font-medium text-xs sm:text-sm text-ink-900 dark:text-ink-50 line-clamp-2 leading-tight"
          title={pickName(product, "bn")}
        >
          {name}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-bold text-primary">
                ৳{salePrice.toLocaleString("en-IN")}
              </span>
              {mrp > salePrice && (
                <span className="text-[10px] sm:text-xs text-ink-400 line-through">
                  ৳{mrp.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            {product.unit && variant === "default" && (
              <div className="text-[10px] text-ink-500 leading-none mt-0.5">
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
 *
 * Validation: we hit `POST /cart/price` with this single product first to
 * confirm the server still considers it active + in stock. Without this,
 * an out-of-stock product (deleted / stock=0 / deactivated since the
 * listing rendered) would slip into localStorage and only blow up at
 * checkout. The validate helper returns the server's reason on failure so
 * the toast carries the right message.
 */
function AddButton({ product }: { product: any }) {
  const { lang } = useTheme();
  const tw = useTwin();
  const name = pickName(product, lang);
  const [busy, setBusy] = useState(false);
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-md hover:bg-primary-700 hover:shadow-lg active:scale-95 transition disabled:opacity-60"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!add || busy) return;
        setBusy(true);
        try {
          const v = await validateSingleProduct(product.id, 1);
          if (!v.ok) {
            toast.error(
              lang === "bn"
                ? v.reason || "এই পণ্য আর পাওয়া যাচ্ছে না"
                : v.reason || "This product is no longer available",
              {
                description:
                  lang === "bn"
                    ? `${name || "পণ্য"} কার্টে যোগ হয়নি`
                    : `${name || "Item"} was not added to cart`,
              },
            );
            return;
          }
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
        } finally {
          setBusy(false);
        }
      }}
    >
      <Plus className="h-5 w-5" />
    </button>
  );
}