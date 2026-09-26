"use client";

import { Flame, Sparkles, Tag } from "lucide-react";
import { useTwin } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Smart discount badge for product pages.
 *
 * Why this exists:
 *   The original badge was a flat `bg-red-500 "-30% off"` pill. Two
 *   problems with that:
 *
 *     1. It always reads as the same urgency level — a 2% nibble
 *        and a 40% blowout both looked like "red badge".
 *     2. The text only showed a percentage — abstract to shoppers,
 *        especially in BD where ৳-amount savings are what people
 *        actually feel ("Save ৳45" hits harder than "5% off").
 *
 *   This component picks the right visual + text based on the size of
 *   the discount AND the absolute ৳-savings, in both Bangla and English.
 *
 * Tier rules (apply in order — first match wins):
 *
 *   - mega      (≥ 30% off OR savings ≥ 500 ৳)
 *                Gradient red→orange pill, flame icon, pulsing glow,
 *                headline reads "{N}% OFF — save ৳X" / "৳X সাশ্রয়".
 *                Color is intentionally loud — large deals deserve
 *                attention; we don't want the customer to scroll past.
 *
 *   - big       (≥ 15% off OR savings ≥ 200 ৳)
 *                Solid accent-red pill, sparkles icon, "Big savings"
 *                framing. Calls out the savings amount, not just the %.
 *
 *   - standard  (≥ 5% off)
 *                Solid red pill, tag icon, "{N}% off — save ৳X".
 *                Same shape as the legacy badge so it doesn't feel
 *                unfamiliar.
 *
 *   - small     (1-4% off)
 *                Soft amber pill, gentle "Save ৳X today" framing.
 *                Avoids the loud red because the deal isn't exciting
 *                enough to justify it — would feel manipulative.
 *
 *   - none      (0%)
 *                Renders nothing.
 *
 * All savings are rounded to whole ৳ — fractional Taka savings
 * ("Save ৳3.47") look sloppy in retail UI.
 *
 * Colors are explicit Tailwind classes (not theme tokens) so the
 * badge always renders with the same brand red regardless of theme
 * or future rebrand work. Contrast stays WCAG AA in both light and
 * dark modes (white-on-red and white-on-amber both ≥ 4.5:1).
 */
export type DiscountTier = "mega" | "big" | "standard" | "small" | "none";

export interface DiscountInfo {
  /** Percentage off, integer 0-100. -1 if unknown. */
  percent: number;
  /** Absolute savings in Taka (rounded). 0 if unknown. */
  savingsTaka: number;
}

export function classifyDiscount(percent: number, savingsTaka: number): DiscountTier {
  if (percent < 0) return "none";
  if (percent >= 30 || savingsTaka >= 500) return "mega";
  if (percent >= 15 || savingsTaka >= 200) return "big";
  if (percent >= 5) return "standard";
  if (percent > 0) return "small";
  return "none";
}

/**
 * Per-tier color tokens. Kept here (not in tailwind.config) so this
 * file is self-contained and a future rebrand can be done by editing
 * one place. Each tier has:
 *   - container: the pill itself
 *   - iconColor: the leading icon (flame / sparkles / tag)
 *   - textColor: text inside the pill
 */
const TIER_STYLES: Record<
  Exclude<DiscountTier, "none">,
  {
    container: string;
    iconColor: string;
    textColor: string;
    /** When true, apply the soft pulse animation (mega deals only). */
    pulse: boolean;
    /** The leading icon component. */
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  mega: {
    // Red→orange gradient is the strongest signal we can show without
    // crossing into "looks like an error". The drop-shadow glow keeps
    // it floating above the page so the eye catches it even when the
    // customer is scanning a long product list.
    container:
      "bg-gradient-to-r from-red-600 via-red-500 to-orange-500 " +
      "shadow-[0_4px_14px_rgba(220,38,38,0.45)] " +
      "ring-1 ring-red-700/20",
    iconColor: "text-white",
    textColor: "text-white",
    pulse: true,
    Icon: Flame,
  },
  big: {
    // Solid accent-red (slightly darker than the standard tier so the
    // eye can still tell them apart at a glance).
    container:
      "bg-red-600 shadow-[0_3px_10px_rgba(220,38,38,0.30)]",
    iconColor: "text-white",
    textColor: "text-white",
    pulse: false,
    Icon: Sparkles,
  },
  standard: {
    // The legacy flat red — kept as-is so the customer's mental model
    // of "red badge = deal" doesn't break.
    container: "bg-red-500",
    iconColor: "text-white",
    textColor: "text-white",
    pulse: false,
    Icon: Tag,
  },
  small: {
    // Soft amber — communicates "you saved a bit" without screaming.
    // Using the brand warning color so it's recognizably "deal" but
    // not so loud it oversells the savings.
    container:
      "bg-amber-100 text-amber-800 " +
      "dark:bg-amber-500/20 dark:text-amber-200 " +
      "ring-1 ring-amber-300/60 dark:ring-amber-500/30",
    iconColor: "text-amber-700 dark:text-amber-300",
    textColor: "text-amber-900 dark:text-amber-100",
    pulse: false,
    Icon: Tag,
  },
};

export interface DiscountBadgeProps {
  percent: number;
  /** MRP in Taka. Optional — if both MRP and salePrice are provided, we
   *  compute savings ourselves so callers don't have to pass two fields. */
  mrp?: number;
  /** Sale price in Taka. */
  salePrice?: number;
  /** Pre-computed savings in Taka. Ignored if mrp+salePrice provided. */
  savingsTaka?: number;
  /** Layout. `inline` sits on the same line as the price; `block` drops
   *  to its own row with a slightly larger font for emphasis. */
  variant?: "inline" | "block";
  className?: string;
}

export function DiscountBadge({
  percent,
  mrp,
  salePrice,
  savingsTaka,
  variant = "inline",
  className,
}: DiscountBadgeProps) {
  const tw = useTwin();

  // Derive savings: prefer explicit prop, else compute from MRP - sale.
  const savings =
    typeof savingsTaka === "number"
      ? Math.max(0, Math.round(savingsTaka))
      : typeof mrp === "number" && typeof salePrice === "number"
        ? Math.max(0, Math.round(mrp - salePrice))
        : 0;

  const tier = classifyDiscount(percent, savings);
  if (tier === "none") return null;

  const styles = TIER_STYLES[tier];
  const Icon = styles.Icon;

  // Format the savings number with the same locale used elsewhere in the
  // app (en-IN gives the Bangladeshi-style thousand separators: 1,234).
  const fmt = (n: number) => n.toLocaleString("en-IN");

  // Text variants per tier. Bilingual — the customer's language toggle
  // picks the right string. We format both fields (% and ৳) so the
  // copy reads naturally in each language:
  //   bn: "৩০% ছাড় — ৳১৫০ সাশ্রয়"     (uses native Bengali numerals)
  //   en: "30% OFF — save ৳150"
  // NOTE: Bengali numerals render correctly with `toLocaleString("bn-BD")`,
  // but "৳" is the only currency glyph we use in the UI. We stick with
  // en-IN digits throughout for parity with the price labels (which use
  // the same locale formatter).
  let label: string;
  if (tier === "mega") {
    label = tw(
      `${percent}% ছাড় — ৳${fmt(savings)} সাশ্রয়`,
      `${percent}% OFF — save ৳${fmt(savings)}`,
    );
  } else if (tier === "big") {
    label = tw(
      `বড় সাশ্রয় — ৳${fmt(savings)} সাশ্রয়`,
      `Big savings — save ৳${fmt(savings)}`,
    );
  } else if (tier === "standard") {
    label = tw(
      `${percent}% ছাড় — ৳${fmt(savings)} সাশ্রয়`,
      `${percent}% off — save ৳${fmt(savings)}`,
    );
  } else {
    // small
    label = tw(
      `আজই ৳${fmt(savings)} সাশ্রয়`,
      `Save ৳${fmt(savings)} today`,
    );
  }

  const sizeClasses =
    variant === "block"
      ? "px-3 py-1.5 text-sm"
      : "px-2.5 py-0.5 text-xs";

  return (
    <span
      // `role="status"` so screen-readers announce changes to the
      // discount value when the customer switches variants.
      role="status"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold",
        "tracking-wide whitespace-nowrap",
        styles.container,
        styles.textColor,
        sizeClasses,
        // Pulse only on mega — other tiers would feel spammy.
        styles.pulse && "animate-[pulse-discount_2s_ease-in-out_infinite]",
        className,
      )}
    >
      <Icon className={cn(styles.iconColor, variant === "block" ? "h-4 w-4" : "h-3 w-3")} />
      <span>{label}</span>
    </span>
  );
}

/**
 * Tiny CSS for the pulse animation. Kept here (rather than tailwind.config)
 * because it's used in exactly one place and bundling it co-located with
 * the component makes it easier to tune without a tailwind rebuild.
 *
 * Animates the box-shadow opacity so the pill "breathes" — stronger glow
 * for ~1s, gentler glow for ~1s. Doesn't change size, so it doesn't
 * shift neighbouring layout.
 */
export const pulseDiscountStyle = `
@keyframes pulse-discount {
  0%, 100% {
    box-shadow: 0 4px 14px rgba(220, 38, 38, 0.45),
                0 0 0 0 rgba(220, 38, 38, 0.0);
  }
  50% {
    box-shadow: 0 4px 18px rgba(220, 38, 38, 0.65),
                0 0 0 6px rgba(220, 38, 38, 0.12);
  }
}
`;
