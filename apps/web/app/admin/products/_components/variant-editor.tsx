"use client";

import { useMemo } from "react";
import { Layers, Plus, X, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  MAX_VARIANTS_PER_PRODUCT,
  nextFreeSkuSuffix,
  validateVariantRow,
  variantErrorMessage,
} from "./_validation/variants";

/**
 * UI shape for one variant row. Mirrors what the backend's
 * `validateVariantRow()` expects (snake_case keys already in the
 * request body) plus UI-only `error` derived from the client validator
 * so we can light up the row before the user hits Save.
 *
 * `id` is null for freshly added rows that haven't been persisted yet.
 */
export interface VariantDraft {
  id: string | null;
  name: string;
  skuSuffix: string;
  priceMrp: number;
  priceSale: number;
  weightGrams: number | null;
  stockQty: number;
  sortOrder: number;
  isActive: boolean;
}

interface Props {
  value: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
  /** Parent SKU for the suffix preview chip (e.g. "XM-000001"). */
  parentSku: string;
}

/**
 * Table-style editor for `ProductVariant` rows. Hydrated from
 * `getProduct.variants[]` on edit, blank on create. Calls `onChange`
 * with the new array — parent owns persistence.
 *
 * Layout: one row per variant with inline-editable cells. Validation
 * runs per row on every keystroke and lights the row red with a
 * helper-text reason. Reordering is via up/down chevrons in the first
 * column (drag-and-drop would be nicer but adds 30KB — out of scope).
 */
export function VariantEditor({ value, onChange, parentSku }: Props) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const atCap = value.length >= MAX_VARIANTS_PER_PRODUCT;

  // Price range summary — derived live so the admin sees the public-site
  // card preview update as they type. Excludes rows with salePrice <= 0
  // so a half-filled draft row doesn't drag the min down to 0.
  const priceRange = useMemo(() => {
    const prices = value
      .map((r) => Number(r.priceSale))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (prices.length === 0) return null;
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }, [value]);

  const addRow = () => {
    if (atCap) return;
    const suffix = nextFreeSkuSuffix(value.map((v) => v.skuSuffix));
    onChange([
      ...value,
      {
        id: null,
        name: "",
        skuSuffix: suffix,
        // Seed the new row from the parent's scalars so the admin
        // doesn't have to retype the price when adding variants that
        // mostly share it (e.g. "Small" and "Large" of the same item).
        priceMrp: 0,
        priceSale: 0,
        weightGrams: null,
        // Default to the same "unlimited" sentinel as the parent stock
        // field so newly added variants don't silently show "0 stock"
        // and disappear from the storefront.
        stockQty: 999999,
        sortOrder: value.length,
        isActive: true,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<VariantDraft>) => {
    onChange(
      value.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (idx: number) => {
    onChange(
      value
        .filter((_, i) => i !== idx)
        // Re-pack sortOrder so the array stays 0..n-1 contiguous.
        .map((row, i) => ({ ...row, sortOrder: i })),
    );
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[idx], next[target]] = [next[target], next[idx]];
    // Re-pack sortOrder so submit order matches row order.
    onChange(next.map((row, i) => ({ ...row, sortOrder: i })));
  };

  return (
    <div className="space-y-3">
      {/* Live summary — mirrors what the public product card shows
          ("From ৳X — ৳Y across N variants"). Hidden when no variant has
          a positive sale price yet (form just opened or all rows empty). */}
      {priceRange && value.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-xs dark:border-ink-300 dark:bg-ink-100">
          <div className="flex items-center gap-2 text-ink-700 dark:text-ink-900">
            <Layers className="h-3.5 w-3.5" />
            <span>
              {t(
                `${value.length}টি ভ্যারিয়েন্ট · মূল্য ৳${priceRange.min} ৳${priceRange.max} থেকে`,
                `${value.length} variant${value.length === 1 ? "" : "s"} · Price from ৳${priceRange.min} – ৳${priceRange.max}`,
              )}
            </span>
          </div>
          <span className="text-ink-500">
            {t("সর্বোচ্চ", "Cap")}: {MAX_VARIANTS_PER_PRODUCT}
          </span>
        </div>
      )}

      {/* Empty state */}
      {value.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-ink-200 bg-ink-50 py-8 text-center dark:border-ink-300 dark:bg-ink-100">
          <Layers className="h-8 w-8 text-ink-300" />
          <p className="text-sm text-ink-500">
            {t(
              "কোনো ভ্যারিয়েন্ট নেই — নিচের বাটনে যোগ করুন",
              "No variants yet — add one with the button below",
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((row, idx) => {
            // Suffix pool from OTHER rows so we don't flag the current
            // row's own suffix as duplicate-against-itself.
            const siblings = value
              .filter((_, i) => i !== idx)
              .map((r) => r.skuSuffix.toUpperCase());
            const err = validateVariantRow(row, siblings);
            return (
              <VariantRow
                key={row.id ?? `new-${idx}`}
                row={row}
                parentSku={parentSku}
                idx={idx}
                total={value.length}
                error={err}
                onPatch={(patch) => updateRow(idx, patch)}
                onRemove={() => removeRow(idx)}
                onMoveUp={() => moveRow(idx, -1)}
                onMoveDown={() => moveRow(idx, 1)}
              />
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={atCap}
        >
          <Plus className="h-4 w-4" />
          {t("ভ্যারিয়েন্ট যোগ করুন", "Add variant")}
        </Button>
        <span className="text-xs text-ink-500">
          {t(
            `${value.length}/${MAX_VARIANTS_PER_PRODUCT} ভ্যারিয়েন্ট`,
            `${value.length}/${MAX_VARIANTS_PER_PRODUCT} variants`,
          )}
        </span>
      </div>
    </div>
  );
}

function VariantRow({
  row,
  parentSku,
  idx,
  total,
  error,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  row: VariantDraft;
  parentSku: string;
  idx: number;
  total: number;
  error: ReturnType<typeof validateVariantRow>;
  onPatch: (patch: Partial<VariantDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const inputBase =
    "h-9 w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-xs dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900";
  const inputError = "border-danger-500 focus-visible:ring-danger-300";
  const isNewRow = row.id === null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-3 transition dark:bg-ink-50",
        error
          ? "border-danger-500 ring-1 ring-danger-200"
          : "border-ink-200 dark:border-ink-300",
      )}
    >
      {/* Top strip: order controls + SKU preview + remove */}
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-500">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={idx === 0}
            title={t("উপরে", "Move up")}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30 dark:hover:bg-ink-100"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={idx === total - 1}
            title={t("নিচে", "Move down")}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-500 hover:bg-ink-100 disabled:opacity-30 dark:hover:bg-ink-100"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <span className="ml-1 font-mono">#{idx + 1}</span>
          {isNewRow && (
            <Badge variant="muted" className="ml-1 text-[10px]">
              {t("নতুন", "New")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono">
            SKU: {parentSku || "—"}
            {row.skuSuffix ? `-${row.skuSuffix.toUpperCase()}` : ""}
          </span>
          <button
            type="button"
            onClick={onRemove}
            title={t("মুছুন", "Remove")}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-500 hover:bg-danger-50 hover:text-danger-700 dark:hover:bg-danger-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main grid — 2 cols on mobile (Name | SKU), 6 cols on md+
          (Name | SKU | MRP | Sale | Weight | Stock). Keeps the row
          scannable without horizontal scroll at the common 3-5
          variant count. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <div className="col-span-2 md:col-span-2">
          <FieldLabel>{t("নাম", "Name")}</FieldLabel>
          <input
            value={row.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder={t("Small, 100ml, 10 kg", "Small, 100ml, 10 kg")}
            className={cn(inputBase, error === "name_required" && inputError)}
          />
        </div>
        <div className="col-span-1 md:col-span-1">
          <FieldLabel>SKU</FieldLabel>
          <input
            value={row.skuSuffix}
            onChange={(e) =>
              onPatch({
                // Uppercase + strip whitespace on input so the user
                // sees a clean suffix as they type. The server also
                // uppercases on save — client-side normalization here
                // just keeps the preview chip honest.
                skuSuffix: e.target.value.toUpperCase().replace(/\s+/g, ""),
              })
            }
            placeholder="S"
            maxLength={8}
            className={cn(
              inputBase,
              "font-mono",
              (error === "skuSuffix_required" ||
                error === "skuSuffix_too_long" ||
                error === "skuSuffix_invalid" ||
                error === "skuSuffix_duplicate") &&
                inputError,
            )}
          />
        </div>
        <div className="col-span-1 md:col-span-1">
          <FieldLabel>MRP</FieldLabel>
          <input
            type="number"
            value={Number.isFinite(row.priceMrp) ? row.priceMrp : ""}
            onChange={(e) =>
              onPatch({ priceMrp: Number(e.target.value) || 0 })
            }
            className={cn(
              inputBase,
              (error === "priceMrp_required" ||
                error === "priceMrp_negative" ||
                error === "priceSale_gt_mrp") &&
                inputError,
            )}
          />
        </div>
        <div className="col-span-1 md:col-span-1">
          <FieldLabel>{t("বিক্রয়", "Sale")}</FieldLabel>
          <input
            type="number"
            value={Number.isFinite(row.priceSale) ? row.priceSale : ""}
            onChange={(e) =>
              onPatch({ priceSale: Number(e.target.value) || 0 })
            }
            className={cn(
              inputBase,
              (error === "priceSale_required" ||
                error === "priceSale_zero" ||
                error === "priceSale_gt_mrp") &&
                inputError,
            )}
          />
        </div>
        <div className="col-span-1 md:col-span-1">
          <FieldLabel>{t("ওজন (গ্রাম)", "Weight (g)")}</FieldLabel>
          <input
            type="number"
            value={row.weightGrams ?? ""}
            onChange={(e) =>
              onPatch({
                weightGrams:
                  e.target.value === "" ? null : Number(e.target.value) || 0,
              })
            }
            placeholder="—"
            className={cn(
              inputBase,
              error === "weightGrams_negative" && inputError,
            )}
          />
        </div>
      </div>

      {/* Second row: stock + active + error message. Stock is the only
          full-width number input on mobile so the +/− buttons aren't
          crammed into a half-cell. */}
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-6">
        <div className="col-span-1 md:col-span-2">
          <FieldLabel>{t("স্টক", "Stock")}</FieldLabel>
          <input
            type="number"
            value={row.stockQty}
            onChange={(e) =>
              onPatch({ stockQty: Number(e.target.value) || 0 })
            }
            className={cn(
              inputBase,
              error === "stockQty_negative" && inputError,
            )}
          />
        </div>
        <div className="col-span-1 flex items-end gap-2 md:col-span-1">
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-ink-200 bg-white px-2 text-xs dark:border-ink-300 dark:bg-ink-50">
            <input
              type="checkbox"
              checked={row.isActive}
              onChange={(e) => onPatch({ isActive: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-ink-300 text-primary-700"
            />
            <span>{t("সক্রিয়", "Active")}</span>
          </label>
        </div>
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-danger-700">
          <AlertTriangle className="h-3 w-3" />
          {variantErrorMessage(error, lang)}
        </p>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-ink-500">
      {children}
    </label>
  );
}
