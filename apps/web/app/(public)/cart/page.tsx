"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { CartView } from "./cart-view";

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