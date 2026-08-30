"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * <CopyButton value="XVM-260829-005" />
 *
 * Tiny icon-only button that copies `value` to the clipboard.
 * - On success: icon swaps to Check for ~1.5s + Sonner toast "কপি হয়েছে!"
 * - On failure: Sonner error toast "কপি করা যায়নি"
 *
 * Use everywhere an order number is displayed so support agents /
 * customers can grab the number with one click.
 */
export interface CopyButtonProps {
  value: string;
  /** Override the success toast text. Default: "কপি হয়েছে!" */
  successLabel?: string;
  /** Visual size. sm = 24px square (default), lg = 32px square (for hero zones). */
  size?: "sm" | "lg";
  className?: string;
}

export function CopyButton({
  value,
  successLabel = "কপি হয়েছে!",
  size = "sm",
  className,
}: CopyButtonProps) {
  const [done, setDone] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatches — render the button shell always, but
  // only wire up navigator.clipboard once we know we're on the client.
  React.useEffect(() => setMounted(true), []);

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(successLabel);
      window.setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error("কপি করা যায়নি — লং-প্রেস করে কপি করুন");
    }
  }

  const sizeCls =
    size === "lg"
      ? "h-8 w-8 [&>svg]:h-4 [&>svg]:w-4"
      : "h-6 w-6 [&>svg]:h-3.5 [&>svg]:w-3.5";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Copy ${value}`}
      title={mounted ? "ক্লিক করে কপি করুন" : undefined}
      className={cn(
        "inline-flex items-center justify-center rounded transition-colors",
        "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
        "dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
        sizeCls,
        className,
      )}
    >
      {done ? (
        <Check className="text-success-500" />
      ) : (
        <Copy />
      )}
    </button>
  );
}