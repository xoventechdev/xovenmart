"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  productId: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  image: string | null;
  unit: string;
  unitPrice: number;
  mrp?: number;
  qty: number;
  weightGrams?: number; // for delivery weight surcharge
}

interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  update: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  subtotal: () => number;
  count: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const existing = get().items.find(
          (i) => i.productId === item.productId
        );
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.productId === item.productId
                ? { ...i, qty: i.qty + item.qty }
                : i
            ),
          });
        } else {
          set({ items: [...get().items, item] });
        }
      },
      update: (productId, qty) => {
        if (qty <= 0) {
          get().remove(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId ? { ...i, qty } : i
          ),
        });
      },
      remove: (productId) => {
        set({ items: get().items.filter((i) => i.productId !== productId) });
      },
      clear: () => set({ items: [] }),
      subtotal: () =>
        get().items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
      count: () => get().items.reduce((s, i) => s + i.qty, 0),
    }),
    { name: "xm-cart" }
  )
);
