"use client";

import Link from "next/link";
import Image from "next/image";
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";

/**
 * Resolve a cart item's display name from the live language toggle.
 * Falls back to the other locale if the chosen one is empty.
 */
function itemName(item: any, lang: "bn" | "en"): string {
  if (lang === "en") return item.nameEn || item.nameBn || "";
  return item.nameBn || item.nameEn || "";
}

export function CartView() {
  const cart = useCart();
  const { lang } = useTheme();
  const tw = useTwin();
  const items = cart.items;
  const subtotal = cart.subtotal();

  if (items.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <ShoppingBag className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          {tw("আপনার কার্ট খালি", "Your cart is empty")}
        </h2>
        <p className="text-muted-foreground mb-6">
          {tw(
            "এখনো কোনো পণ্য যোগ করা হয়নি। আমাদের ক্যাটালগ দেখুন।",
            "No items yet. Browse our catalog to get started.",
          )}
        </p>
        <Button asChild size="lg">
          <Link href="/">
            {tw("কেনাকাটা শুরু করুন", "Start shopping")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Items list */}
      <div className="lg:col-span-2 space-y-3">
        {items.map((item) => (
          <div
            key={item.productId}
            className="flex gap-4 bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-3"
          >
            <Link
              href={`/product/${item.slug}`}
              className="relative w-20 h-20 flex-shrink-0 bg-ink-50 dark:bg-ink-800 rounded-lg overflow-hidden"
            >
              {item.image && (
                <Image
                  src={item.image}
                  alt={itemName(item, lang)}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              )}
            </Link>
            <div className="flex-1">
              <Link
                href={`/product/${item.slug}`}
                className="font-semibold hover:text-primary line-clamp-2"
              >
                {itemName(item, lang)}
              </Link>
              <div className="text-sm text-muted-foreground mt-1">
                ৳{item.unitPrice.toLocaleString("en-IN")} / {item.unit}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center border border-ink-200 dark:border-ink-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => cart.update(item.productId, item.qty - 1)}
                    className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800"
                    aria-label={tw("কমান", "Decrease")}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="px-3 text-sm font-semibold">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => cart.update(item.productId, item.qty + 1)}
                    className="p-1.5 hover:bg-ink-100 dark:hover:bg-ink-800"
                    aria-label={tw("বাড়ান", "Increase")}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => cart.remove(item.productId)}
                  className="text-red-500 hover:text-red-600 p-2"
                  aria-label={tw("মুছে ফেলুন", "Remove")}
                  title={tw("মুছে ফেলুন", "Remove")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-primary">
                ৳{(item.unitPrice * item.qty).toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-5 sticky top-32">
          <h2 className="font-bold text-lg mb-4">
            {tw("অর্ডার সারাংশ", "Order summary")}
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {tw("সাবটোটাল", "Subtotal")}
              </span>
              <span>৳{subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {tw("ডেলিভারি ফি", "Delivery fee")}
              </span>
              <span className="text-muted-foreground">
                {tw("পরে গণনা হবে", "Calculated at checkout")}
              </span>
            </div>
            <div className="border-t border-ink-200 dark:border-ink-800 pt-2 flex justify-between font-bold text-base">
              <span>{tw("মোট", "Total")}</span>
              <span className="text-primary">
                ৳{subtotal.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
          <Button asChild className="w-full mt-4" size="lg">
            <Link href="/checkout">
              {tw("চেকআউট করুন", "Checkout")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full mt-2"
            size="sm"
          >
            <Link href="/">
              {tw("আরো কেনাকাটা", "Continue shopping")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}