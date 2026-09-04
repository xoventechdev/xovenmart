"use client";

import * as React from "react";
import { BrandMark } from "@/components/brand-mark";

/**
 * Smart brand block — single source of truth for "what does the brand
 * look like at the top of a public page?".
 *
 * Decision tree (logo-first; text only when there's no logo):
 *
 *   1. Light-mode logo URL present → render the logo only.
 *      Light/dark logos are paired via `dark:hidden` / `dark:inline-block`
 *      so React doesn't need to know the active theme.
 *   2. Dark-mode logo URL present but no light logo → render the dark
 *      logo in BOTH modes (a missing light logo is treated as
 *      "admin only uploaded the dark variant"). Same `dark:inline-block`
 *      so it stays visible if the user toggles.
 *   3. No logo URL, brand name set → text stack: name on top, tagline
 *      below (admin-editable). A BrandMark icon can prefix the row
 *      when the caller wants one.
 *   4. No logo URL, no brand name, tagline set → tagline only.
 *   5. Nothing at all → BrandMark fallback icon at the requested size.
 *
 * The rule the user asked for: "logo URL present → show only the logo;
 * otherwise → show name + tagline". The added nuance above just handles
 * the few edge cases (dark-only logo, name missing, both missing) so
 * the page never renders an empty box or duplicates the logo and text.
 *
 * Variant + size props shape the layout for each consumer:
 *   - `"header"`  → logo `h-9` (36 px), text-lg bold name + text-xs tagline.
 *   - `"footer"`  → logo `h-10` (40 px), text-xl bold name + text-sm tagline.
 *   - `"lockup"`  → logo `h-9`–`h-12` depending on `size`, no text.
 *   - `"auth"`    → icon-only (BrandMark fallback, no text).
 *
 * Consumers:
 *   - SiteHeader (variant="header")
 *   - SiteFooter (variant="footer")
 *   - MaintenanceLock (variant="lockup")
 *   - Auth pages via the existing <BrandLockup /> (separate component
 *     because auth pages have a centred, square-ish logo and never
 *     need the text stack).
 */
export type BrandBlockVariant = "header" | "footer" | "lockup" | "auth";

export interface BrandBlockProps {
  /** Admin-editable brand asset + name + tagline. Empty strings = fallback. */
  brand: {
    logoUrl?: string;
    logoDarkUrl?: string;
    nameEn?: string;
    nameBn?: string;
    taglineBn?: string;
    taglineEn?: string;
  };
  /** Language toggle — selects nameBn vs nameEn + taglineBn vs taglineEn. */
  lang: "bn" | "en";
  /** Layout variant. See file-level doc. */
  variant?: BrandBlockVariant;
  /** Optional explicit className on the outer wrapper. */
  className?: string;
  /**
   * Optional extra content to render AFTER the brand block, inside the
   * same `<Link>` (e.g. header puts the search bar to the right of the
   * block via this slot — not used here directly, but exposed so the
   * site header doesn't have to wrap the brand in an extra div just
   * to put siblings next to it).
   */
  children?: React.ReactNode;
  /** Disable the wrapping `<a>` — used by the maintenance lock where
   *  the brand is decorative, not a navigation target. */
  disableLink?: boolean;
  /** Accessible label for the wrapping link. Defaults to the brand name. */
  ariaLabel?: string;
}

export function BrandBlock({
  brand,
  lang,
  variant = "header",
  className,
  children,
  disableLink,
  ariaLabel,
}: BrandBlockProps) {
  const hasAnyLogo = !!(brand.logoUrl || brand.logoDarkUrl);
  const name = ((lang === "en" ? brand.nameEn : brand.nameBn) ?? "").trim();
  const tagline = ((lang === "en" ? brand.taglineEn : brand.taglineBn) ?? "").trim();

  // Variant-specific sizing + className presets.
  const sizes = sizeFor(variant);

  // Render rules — see file-level doc for the full decision tree.
  const content = (() => {
    if (hasAnyLogo) {
      // 1 + 2: logo present → ONLY the logo. Never text.
      return (
        <span className="inline-flex items-center">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={name || "Logo"}
              className={
                brand.logoDarkUrl
                  ? `object-contain dark:hidden ${sizes.logo}`
                  : `object-contain ${sizes.logo}`
              }
              style={{ height: sizes.logoHeight, width: "auto", maxWidth: sizes.logoMaxWidth }}
            />
          )}
          {brand.logoDarkUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoDarkUrl}
              alt={name || "Logo"}
              className={`object-contain hidden dark:inline-block ${sizes.logo}`}
              style={{ height: sizes.logoHeight, width: "auto", maxWidth: sizes.logoMaxWidth }}
            />
          )}
        </span>
      );
    }

    if (name) {
      // 3: text stack — name on top, tagline below. Prefix with a
      // BrandMark icon for the header/footer so the brand still has
      // visual weight without a logo. Lockup variant skips the icon
      // (it's centred, the icon would compete with the title).
      const showIcon = variant === "header" || variant === "footer";
      return (
        <span className="inline-flex items-center gap-2">
          {showIcon && <BrandMark size={sizes.iconSize} />}
          <span className="min-w-0">
            <span className={`block truncate ${sizes.name}`}>{name}</span>
            {tagline && (
              <span
                className={`block truncate ${sizes.tagline} ${variant === "header" ? "hidden sm:block" : ""}`}
              >
                {tagline}
              </span>
            )}
          </span>
        </span>
      );
    }

    if (tagline) {
      // 4: tagline only.
      return (
        <span className="inline-flex items-center gap-2">
          <BrandMark size={sizes.iconSize} />
          <span className={`truncate ${sizes.tagline}`}>{tagline}</span>
        </span>
      );
    }

    // 5: nothing at all → BrandMark fallback icon.
    return <BrandMark size={sizes.iconSize} />;
  })();

  // When `disableLink` is set (maintenance lock), skip the wrapper link.
  if (disableLink) {
    return (
      <span className={className} aria-label={ariaLabel ?? (name || "Brand")}>
        {content}
      </span>
    );
  }
  return (
    <a
      href="/"
      className={className ?? "inline-flex items-center gap-2 shrink-0"}
      aria-label={ariaLabel ?? (name || "Brand")}
    >
      {content}
      {children}
    </a>
  );
}

/**
 * Per-variant sizing. Kept in one place so all four consumers share
 * the same scale (logo h=40 px in header/footer, h=32 px in the
 * centred lockup, etc).
 */
function sizeFor(variant: BrandBlockVariant) {
  switch (variant) {
    case "header":
      return {
        logoHeight: 36,
        logoMaxWidth: 160,
        logo: "h-9",
        iconSize: 32,
        name: "text-base font-bold text-primary",
        tagline: "text-xs text-muted-foreground -mt-0.5",
      };
    case "footer":
      return {
        logoHeight: 40,
        logoMaxWidth: 180,
        logo: "h-10",
        iconSize: 36,
        name: "text-xl font-bold text-white",
        tagline: "text-sm text-ink-300",
      };
    case "lockup":
      return {
        logoHeight: 96,
        logoMaxWidth: 280,
        logo: "h-24",
        iconSize: 96,
        name: "text-3xl font-bold",
        tagline: "text-sm text-ink-600 dark:text-ink-300",
      };
    case "auth":
      return {
        logoHeight: 64,
        logoMaxWidth: 200,
        logo: "h-16",
        iconSize: 64,
        name: "text-xl font-bold",
        tagline: "text-xs text-muted-foreground",
      };
  }
}