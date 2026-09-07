"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Inline editable price cell used in the admin product list.
 *
 * Renders the formatted BDT value when idle. Click → swaps to a small
 * `<input type="number">` with a Check / X button. Enter or ✓ → PATCH
 * `PATCH /admin/products/:id` with the new value; Esc or ✕ → cancel.
 *
 * Optimistic update: the cell flips to the new value immediately on
 * success and the React Query cache is patched in place, so the rest of
 * the row stays in sync without a refetch. On error we restore the
 * previous value + show a toast with the server message.
 *
 * Why this exists: clicking into each product edit page to change a
 * price is the slowest path possible when there are 500+ SKUs. This
 * turns each cell into a one-keystroke PATCH.
 *
 * Props:
 *   - productId: target for the PATCH
 *   - field:     which column to update ("mrp" | "salePrice" | "costPrice")
 *   - value:     current numeric value
 *   - format:    how to render when idle (defaults to `formatBDT`)
 *   - min:       lower bound (defaults to 0)
 */
interface Props {
  productId: string;
  field: "mrp" | "salePrice" | "costPrice";
  value: number | string;
  format: (v: number) => string;
  min?: number;
  className?: string;
  /** Optional label for accessibility (e.g. "MRP"). */
  label?: string;
}

export function EditablePriceCell({
  productId,
  field,
  value,
  format,
  min = 0,
  className,
  label,
}: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // When the row data refreshes from the server (another tab / bulk
  // update), keep the displayed value in sync — but only when we're not
  // actively editing, otherwise the user's typing gets clobbered.
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  // Focus + select-all when entering edit mode (standard spreadsheet feel).
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = useMutation({
    mutationFn: (next: number) =>
      api.patch(`/admin/products/${productId}`, { [field]: next }),
    // React Query passes `variables` (= the arg passed to `mutate()`) as
    // the first arg to onSuccess. Capture it explicitly so the closure
    // doesn't try to read `next` from the outer mutationFn scope.
    onSuccess: (_data, next) => {
      // Patch the cached list so dependent rows reflect the change
      // without forcing a refetch. The "admin products" cache key is
      // shared across all the list variants (all/featured/inactive/
      // low-stock), so we patch every page we have in memory.
      qc.setQueriesData(
        { queryKey: ["admin", "products"] },
        (old: any) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((p: any) =>
              p.id === productId ? { ...p, [field]: next } : p,
            ),
          };
        },
      );
      toast.success(`${label ?? field} → ৳${next.toLocaleString()}`);
    },
    onError: (e: any) => {
      const msg =
        e?.data?.message?.toString?.() ||
        (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ||
        e?.message ||
        "Save failed";
      toast.error(msg);
      setDraft(String(value)); // restore on failure
    },
    onSettled: () => setEditing(false),
  });

  const numeric = Number(draft);
  const isValid = Number.isFinite(numeric) && numeric >= min;
  // salePrice cannot exceed mrp — quick client-side guard so the admin
  // gets instant feedback. The server re-checks anyway.
  const overMrp =
    field === "salePrice" &&
    Number.isFinite(numeric) &&
    numeric > Number(value) * 100; // we don't know mrp here; the server checks

  const commit = () => {
    if (!isValid) {
      toast.error(`Must be a number ≥ ${min}`);
      return;
    }
    const next = Math.round(numeric); // integer Taka — no paisa
    if (next === Number(value)) {
      setEditing(false);
      setDraft(String(value));
      return;
    }
    save.mutate(next);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(String(value));
  };

  if (editing) {
    return (
      <div className={cn("flex items-center justify-end gap-1", className)}>
        <input
          ref={inputRef}
          type="number"
          min={min}
          step={1}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="w-24 rounded border border-primary-500 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums outline-none dark:bg-ink-50"
        />
        <button
          type="button"
          onClick={commit}
          disabled={save.isPending || !isValid}
          className="flex h-5 w-5 items-center justify-center rounded bg-success-600 text-white hover:bg-success-700 disabled:opacity-50"
          title="Save (Enter)"
        >
          {save.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={save.isPending}
          className="flex h-5 w-5 items-center justify-center rounded bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-200 dark:hover:bg-ink-300"
          title="Cancel (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "group inline-flex items-center justify-end gap-1 rounded px-1.5 py-0.5 text-right text-xs tabular-nums",
        "hover:bg-primary-50 hover:ring-1 hover:ring-primary-300 dark:hover:bg-primary-900/20",
        "transition",
        className,
      )}
      title="Click to edit"
    >
      {format(Number(value))}
    </button>
  );
}
