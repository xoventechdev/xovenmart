"use client";

import { useEffect } from "react";
import { useCart } from "./cart";
import { api, ApiError } from "./api";
import { toast } from "sonner";

export interface CartValidationResult {
  /** Item keys that survived server validation. */
  kept: string[];
  /** Items the server said are invalid (missing / inactive / out-of-stock). */
  removed: { productId: string; reason: string }[];
  /** Did anything change? */
  changed: boolean;
}

interface PriceResponse {
  items: Array<{ productId: string }>;
  errors: string[];
}

/**
 * Validate the local-storage cart against the live catalog by hitting
 * `POST /cart/price`. Returns the list of items that were removed so
 * the caller can show a toast.
 *
 * The cart is **not** mutated — callers decide whether to apply the
 * changes (e.g. the cart page always applies; checkout applies only
 * when the server confirmed something was actually wrong, so we don't
 * silently drop items the user still wants to look at).
 */
export async function validateCart(
  items: { productId: string; qty: number }[],
): Promise<CartValidationResult> {
  if (!items || items.length === 0) {
    return { kept: [], removed: [], changed: false };
  }
  try {
    const res = await api.post<PriceResponse>("/cart/price", {
      items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
    });
    const validIds = new Set(res.items.map((i) => i.productId));
    const removed: CartValidationResult["removed"] = [];
    for (const it of items) {
      if (!validIds.has(it.productId)) {
        const errLine =
          res.errors.find((e) => e.includes(it.productId)) ??
          res.errors.find((e) => e.includes("not found")) ??
          res.errors[0] ??
          "Product is no longer available";
        removed.push({ productId: it.productId, reason: errLine });
      }
    }
    return {
      kept: items.filter((i) => validIds.has(i.productId)).map((i) => i.productId),
      removed,
      changed: removed.length > 0,
    };
  } catch (e) {
    // Network errors etc. — leave the cart alone.
    return { kept: items.map((i) => i.productId), removed: [], changed: false };
  }
}

/**
 * Validate ONE product before adding it to the cart. Catches the case
 * where the product went out of stock or was deleted between the page
 * load and the click. Returns `{ ok, reason, available }` so the caller
 * can decide what to do (toast, cap qty, redirect to a different
 * product, etc.).
 *
 * Implementation: hit `POST /cart/price` with just this item. The
 * server will include the item in `items[]` only if it's valid; an
 * error line in `errors[]` carries the reason.
 */
export async function validateSingleProduct(
  productId: string,
  qty: number,
): Promise<{ ok: true; available: number } | { ok: false; reason: string; available: 0 }> {
  try {
    const res = await api.post<PriceResponse>("/cart/price", {
      items: [{ productId, qty }],
    });
    if (res.items.some((i) => i.productId === productId)) {
      return { ok: true, available: qty };
    }
    // The item wasn't accepted — surface the server's reason.
    const errLine =
      res.errors.find((e) => e.includes(productId)) ??
      res.errors[0] ??
      "Product is no longer available";
    return { ok: false, reason: errLine, available: 0 };
  } catch (e) {
    if (e instanceof ApiError) {
      return {
        ok: false,
        reason: e.data?.message?.toString?.() ?? e.message ?? "Could not add to cart",
        available: 0,
      };
    }
    // Network error — fail closed so the user isn't surprised at checkout.
    return {
      ok: false,
      reason: "Could not reach the server. Please check your connection.",
      available: 0,
    };
  }
}

/**
 * Hook that runs `validateCart` once on mount and removes any items
 * the server says are invalid. Use on the cart page so the user sees
 * a clean cart instead of being surprised at checkout.
 */
export function useCartValidationOnMount() {
  const items = useCart((s) => s.items);
  const remove = useCart((s) => s.remove);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return;
    validateCart(items).then((result) => {
      if (cancelled || !result.changed) return;
      for (const r of result.removed) remove(r.productId);
      const count = result.removed.length;
      toast.warning(
        count === 1
          ? "Removed 1 unavailable item from your cart"
          : `Removed ${count} unavailable items from your cart`,
      );
    });
    return () => {
      cancelled = true;
    };
    // Intentionally run only on first mount — we don't want to re-validate
    // every time qty changes (that would cause an infinite loop with the
    // remove() that fires inside the effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

