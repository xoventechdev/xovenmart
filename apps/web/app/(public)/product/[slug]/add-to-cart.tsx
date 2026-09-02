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

export function AddToCartButton({ product }: { product: any }) {
  const router = useRouter();
  const tw = useTwin();
  const { lang } = useTheme();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const cart = useCart();

  const inStock = product.inStock !== false;
  const total = (Number(product.salePrice) * qty).toLocaleString("en-IN");

  const handleAdd = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Server-side stock + active check before we add to the local cart.
      // Without this, the user only finds out at checkout that the product
      // went out of stock between page load and click (stale page) or
      // was deleted by an admin. Catches:
      //   - product no longer active
      //   - product deleted
      //   - stock dropped to 0 between SSR and now
      const v = await validateSingleProduct(product.id, qty);
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
        slug: product.slug,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        image: product.image,
        unit: product.unit,
        unitPrice: Number(product.salePrice),
        mrp: product.mrp ? Number(product.mrp) : undefined,
        qty,
        weightGrams: product.weightGrams ? Number(product.weightGrams) : undefined,
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
        <span className="text-sm text-muted-foreground">{product.unit}</span>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={handleAdd}
        disabled={!inStock || busy}
      >
        {busy ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <ShoppingCart className="mr-2 h-5 w-5" />
        )}
        {!busy &&
          (inStock
            ? tw(`কার্টে যোগ করুন — ৳${total}`, `Add to cart — ৳${total}`)
            : tw("স্টকে নেই", "Out of stock"))}
      </Button>
    </div>
  );
}
