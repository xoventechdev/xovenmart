"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useTwin } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { validateSingleProduct } from "@/lib/cart-validate";
import { toast } from "sonner";

/**
 * Phase 1 variants: when `product.hasVariants === true`, the customer
 * MUST pick a variant before adding to cart. The picker lives in
 * `product-view.tsx` (alongside the price card) and passes the
 * currently-selected variant down to this button. We display the
 * chosen variant's price/stock, and disable the button with a
 * "please select a variant" hint when nothing is selected.
 *
 * For legacy single-SKU products, `selectedVariantId` is ignored —
 * the button uses `product.salePrice` / `product.inStock` as before.
 */
export function AddToCartButton({
  product,
  selectedVariant,
}: {
  product: any;
  selectedVariant?: any | null;
}) {
  const router = useRouter();
  const tw = useTwin();
  const { lang } = useTheme();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const cart = useCart();

  const hasVariants = product.hasVariants === true;
  // Display price + stock come from the selected variant when in variant
  // mode, otherwise from the product scalars.
  const displayMrp = hasVariants
    ? selectedVariant
      ? Number(selectedVariant.priceMrp)
      : Number(product.mrp)
    : Number(product.mrp);
  const displaySale = hasVariants
    ? selectedVariant
      ? Number(selectedVariant.priceSale)
      : Number(product.salePrice)
    : Number(product.salePrice);
  const displayWeightGrams = hasVariants
    ? selectedVariant
      ? selectedVariant.weightGrams ?? product.weightGrams ?? null
      : product.weightGrams ?? null
    : product.weightGrams ?? null;
  const inStock = hasVariants
    ? selectedVariant
      ? selectedVariant.inStock === true
      : false
    : product.inStock !== false;
  const requireSelection = hasVariants && !selectedVariant;

  const total = (displaySale * qty).toLocaleString("en-IN");
  const variantLabel = selectedVariant?.name;

  const handleAdd = async () => {
    if (busy) return;
    if (requireSelection) return;
    setBusy(true);
    try {
      // Server-side stock + active check before we add to the local cart.
      // Without this, the user only finds out at checkout that the
      // product/variant went out of stock between page load and click
      // (stale page) or was deleted by an admin. Catches:
      //   - product no longer active
      //   - variant no longer active
      //   - stock dropped to 0 between SSR and now
      const v = await validateSingleProduct(
        product.id,
        qty,
        selectedVariant?.id ?? null,
      );
      if (!v.ok) {
        toast.error(
          lang === "bn"
            ? v.reason || "এই পণ্য আর পাওয়া যাচ্ছে না"
            : v.reason || "This product is no longer available",
          { description: lang === "bn" ? "কার্টে যোগ করা হয়নি" : "Not added to cart" },
        );
        return;
      }
      cart.add({
        productId: product.id,
        variantId: selectedVariant?.id ?? null,
        variantName: selectedVariant?.name ?? null,
        slug: product.slug,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        image: product.image,
        unit: product.unit,
        unitPrice: displaySale,
        mrp: displayMrp,
        qty,
        weightGrams: displayWeightGrams
          ? Number(displayWeightGrams)
          : undefined,
      });
      router.push("/cart");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{tw("পরিমাণ:", "Quantity:")}</span>
        <div className="flex items-center border border-ink-200 dark:border-ink-800 rounded-lg">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="p-2 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-50"
            disabled={qty <= 1}
            aria-label={tw("কমান", "Decrease")}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="px-4 font-semibold">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(99, q + 1))}
            className="p-2 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-50"
            disabled={qty >= 99}
            aria-label={tw("বাড়ান", "Increase")}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm text-muted-foreground">
          {variantLabel ? variantLabel : product.unit}
        </span>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={handleAdd}
        disabled={!inStock || busy || requireSelection}
      >
        {busy ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <ShoppingCart className="mr-2 h-5 w-5" />
        )}
        {!busy &&
          (requireSelection
            ? tw("একটি ভ্যারিয়েন্ট নির্বাচন করুন", "Please select a variant")
            : inStock
              ? tw(`কার্টে যোগ করুন — ৳${total}`, `Add to cart — ৳${total}`)
              : tw("স্টকে নেই", "Out of stock"))}
      </Button>
    </div>
  );
}
