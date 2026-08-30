"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Period-over-period delta chip for KPI tiles.
 * Green ↑ when positive, red ↓ when negative, muted — when 0.
 * Hides itself when the value is 0 AND previous was 0 (no comparison meaningful).
 */
export function DeltaChip({
  value,
  lang,
  suffix = "%",
  className,
}: {
  value: number;
  lang: "bn" | "en";
  suffix?: string;
  className?: string;
}) {
  if (value === 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium text-ink-400", className)}>
        <Minus className="h-3 w-3" />
        0{suffix}
      </span>
    );
  }
  const isUp = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        isUp
          ? "bg-success-100 text-success-700 dark:bg-success-100"
          : "bg-danger-100 text-danger-700 dark:bg-danger-100",
        className,
      )}
      title={isUp ? (lang === "bn" ? "গত সপ্তাহের চেয়ে বেশি" : "Up vs previous period") : (lang === "bn" ? "গত সপ্তাহের চেয়ে কম" : "Down vs previous period")}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(value)}{suffix}
    </span>
  );
}
