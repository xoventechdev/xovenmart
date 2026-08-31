"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { CartView } from "./cart-view";

// Route Segment Config — opt OUT of static prerender at build time. The
// cart is entirely client-side (localStorage, zustand) and depends on
// runtime auth. Next 15 will still happily try to prerender it during
// `next build`, which hangs the CI runner because there's no API server
// at localhost:3001. force-dynamic makes Next render this page on-demand.
export const dynamic = "force-dynamic";

export default function CartPage() {
  const tw = useTwin();
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <ShoppingCart className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">
          {tw("আপনার কার্ট", "Your cart")}
        </h1>
      </div>
      <CartView />
    </div>
  );
}