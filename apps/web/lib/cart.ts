"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Cart line item.
 *
 * `variantId` is optional:
 *   - `null` / `undefined` → legacy single-SKU row (the only kind before
 *     Phase 1 variants shipped). Stored as `null` (not omitted) so the
 *     merge key logic is uniform.
 *   - `"<cuid>"`            → this line is for a specific ProductVariant.
 *     The cart merge key is `(productId, variantId ?? null)`, so the same
 *     product with two different variants produces two cart rows.
 */
export interface CartItem {
  productId: string;
  /** Optional — null for legacy single-SKU items, set for variant items. */
  variantId?: string | null;
  /** Human label of the variant ("Small", "10 kg") for cart/checkout UI.
   *  Only set when variantId is set. */
  variantName?: string | null;
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
  update: (productId: string, qty: number, variantId?: string | null) => void;
  remove: (productId: string, variantId?: string | null) => void;
  clear: () => void;
  subtotal: () => number;
  count: () => number;
}

/** Cart merge key: same product with different variants = different rows.
 *  `null` for variantId on both sides is treated as equal (legacy). */
function sameRow(a: CartItem, productId: string, variantId?: string | null) {
  if (a.productId !== productId) return false;
  const aV = a.variantId ?? null;
  const bV = variantId ?? null;
  return aV === bV;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        const items = get().items;
        const idx = items.findIndex((i) =>
          sameRow(i, item.productId, item.variantId ?? null),
        );
        if (idx >= 0) {
          const next = items.slice();
          next[idx] = { ...next[idx], qty: next[idx].qty + item.qty };
          set({ items: next });
        } else {
          set({ items: [...items, item] });
        }
      },
      update: (productId, qty, variantId) => {
        if (qty <= 0) {
          get().remove(productId, variantId);
          return;
        }
        set({
          items: get().items.map((i) =>
            sameRow(i, productId, variantId ?? null) ? { ...i, qty } : i,
          ),
        });
      },
      remove: (productId, variantId) => {
        set({
          items: get().items.filter(
            (i) => !sameRow(i, productId, variantId ?? null),
          ),
        });
      },
      clear: () => set({ items: [] }),
      subtotal: () =>
        get().items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
      count: () => get().items.reduce((s, i) => s + i.qty, 0),
    }),
    {
      name: "xm-cart",
      /**
       * Bump the persist version whenever the `CartItem` shape changes.
       * `version: 2` introduces `variantId` + `variantName` for Phase 1
       * variants. Without a version bump, a user with a v1 cart cached in
       * localStorage would have `CartItem` rows that lack the new fields,
       * and TypeScript would happily serialize them — but the cart/checkout
       * logic downstream would treat those rows as variantId=null, which
       * means the user's saved cart silently becomes "null variantId" on
       * every line. That's fine for legacy single-SKU products, but for
       * products the admin later flagged as `hasVariants=true` those
       * cached rows would point at an invalid target. Clearing the cart
       * on upgrade is the simplest, safest UX choice.
       *
       * `migrate` isn't called when version matches; we only need to
       * accept the default behavior of "drop mismatched-version data".
       */
      version: 2,
    }
  )
);
