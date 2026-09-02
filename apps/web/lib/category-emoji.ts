/**
 * Map of category slug → fallback emoji.
 *
 * Used by:
 *   - Home page category grid (`apps/web/app/(public)/home-view.tsx`)
 *   - Header category strip (`apps/web/components/public/site-header.tsx`)
 *
 * When a category has an `imageUrl` set in the database, callers prefer
 * that image over the emoji. This map is purely a fallback so the UI
 * never shows a blank/grey square for an unconfigured category.
 *
 * Add new entries here when introducing new root categories — subcategory
 * slugs (rice, oil, spices, etc.) are also included so deep category
 * landings get a recognizable visual.
 */
const EMOJI_MAP: Record<string, string> = {
  // Roots
  grocery: "🍚",
  vegetables: "🥬",
  fruits: "🍇",
  dairy: "🥛",
  snacks: "🍪",
  beverages: "🥤",
  household: "🧴",
  "personal-care": "🧼",
  "fish-meat": "🍗",
  bakery: "🍞",

  // Sub-categories
  rice: "🍚",
  oil: "🛢️",
  spices: "🌶️",
  lentils: "🫘",
  flour: "🌾",
  salt: "🧂",
  sugar: "🍬",
  "fresh-veggies": "🥕",
  "leafy-greens": "🥬",
  "seasonal-fruits": "🥭",
  "local-fruits": "🍌",
  milk: "🥛",
  yogurt: "🍶",
  eggs: "🥚",
  "chips-biscuits": "🍪",
  noodles: "🍜",
  "soft-drinks": "🥤",
  tea: "🍵",
  cleaning: "🧹",
  skincare: "🧴",
  chicken: "🍗",
  beef: "🥩",
  "fresh-fish": "🐟",
  bread: "🍞",
  cakes: "🎂",
  buns: "🥐",
  "frozen-veg": "🥦",
  "ice-cream": "🍦",
  sweets: "🍮",
};

const FALLBACK = "📦";

/** Resolve a fallback emoji for a category slug. Returns `📦` if unknown. */
export function getCategoryEmoji(slug: string | null | undefined): string {
  if (!slug) return FALLBACK;
  return EMOJI_MAP[slug] ?? FALLBACK;
}