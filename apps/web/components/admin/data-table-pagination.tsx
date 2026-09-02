"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Reusable pagination control for admin list pages.
 *
 *  ┌────────────────────────────────────────────────────────────┐
 *  │ Showing 1-25 of 137     [10 ▾] / page      ‹ Prev · 1/6 ›  │
 *  └────────────────────────────────────────────────────────────┘
 *
 * The page-size dropdown is changeable from the UI — default 25, options
 * 10/25/50/100. Resets to page 1 whenever the user changes page size.
 *
 * Pass `total` from your API response (the backend uses `parseQuery()` which
 * already returns `{ items, total, page, perPage }` from every list endpoint).
 */
export interface DataTablePaginationProps {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  /** Hide the per-page dropdown (e.g. for fixed-size exports). */
  hidePerPage?: boolean;
  /** Show range like "1-25 of 137" — disabled by default to keep it compact. */
  showRange?: boolean;
  /** When the user switches perPage, should we jump back to page 1? Default true. */
  resetPageOnPerPageChange?: boolean;
  perPageOptions?: number[];
}

export function DataTablePagination({
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
  hidePerPage,
  showRange,
  resetPageOnPerPageChange = true,
  perPageOptions = [10, 25, 50, 100],
}: DataTablePaginationProps) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const end = Math.min(total, safePage * perPage);

  const handlePerPageChange = (next: number) => {
    if (next === perPage) return;
    onPerPageChange(next);
    if (resetPageOnPerPageChange) onPageChange(1);
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 px-3 py-2 dark:border-ink-300",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-ink-500">
        {showRange ? (
          <span>
            {t(`${start}-${end} এর মধ্যে ${total}`, `${start}-${end} of ${total}`)}
          </span>
        ) : (
          <span>
            {t(`মোট ${total}`, `Total ${total}`)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!hidePerPage && (
          <div className="flex items-center gap-1 text-xs text-ink-500">
            <label className="sr-only" htmlFor="data-table-per-page">
              {t("প্রতি পৃষ্ঠায়", "Per page")}
            </label>
            <select
              id="data-table-per-page"
              value={perPage}
              onChange={(e) => handlePerPageChange(Number(e.target.value))}
              className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              {perPageOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="hidden sm:inline">
              {t("প্রতি পৃষ্ঠায়", "/ page")}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label={t("আগের পৃষ্ঠা", "Previous page")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="min-w-[64px] text-center text-xs font-medium text-ink-700 dark:text-ink-900">
            {t(`পৃষ্ঠা ${safePage} / ${totalPages}`, `Page ${safePage} / ${totalPages}`)}
          </span>

          <Button
            variant="outline"
            size="icon"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label={t("পরের পৃষ্ঠা", "Next page")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}