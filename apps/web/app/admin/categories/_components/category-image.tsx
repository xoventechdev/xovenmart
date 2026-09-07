"use client";

import { useState } from "react";
import { AlertTriangle, Tag } from "lucide-react";
import { getCategoryEmoji } from "@/lib/category-emoji";

/**
 * Thumbnail cell used in both admin category list pages.
 *
 * Renders one of four states, in priority order:
 *
 *   1. **Broken image** (`error === true`) — red-tinted frame with ⚠ icon
 *      and a small "Broken" caption so the admin can spot at a glance
 *      which categories have a 404'd hero image (very useful after a
 *      bulk import like the Unsplash script).
 *   2. **Real image** (`url` present + loaded OK) — `<img>` with rounded
 *      clipping. We use `<img>` instead of `next/image` so any host
 *      works without a `remotePatterns` whitelist — the admin form is
 *      a back-office tool, not a public-facing surface that needs the
 *      optimizer.
 *   3. **Emoji fallback** (no `url`) — category slug → emoji via
 *      `lib/category-emoji.ts` (the same map used on the public site).
 *   4. **Generic tag icon** (no slug match either) — last-resort neutral.
 *
 * Why `<img onError>` instead of `next/image`:
 *   - The whole point of this component is to surface broken images. The
 *     Next.js image proxy hides the original failure and shows its own
 *     placeholder. A raw `<img>` lets us catch the real error and flip
 *     to the red "broken" state.
 *   - The admin pages are a small surface area; the optimizer isn't
 *     worth the whitelisting tax.
 */
interface Props {
  url?: string | null;
  slug?: string | null;
  /** Pixel size — square. Defaults to 36 (matches the existing icon). */
  size?: number;
  /** Extra class names for the outer frame. */
  className?: string;
}

export function CategoryImage({ url, slug, size = 36, className = "" }: Props) {
  const [errored, setErrored] = useState(false);

  // Broken: had a URL but it failed to load → flag it
  if (url && errored) {
    return (
      <div
        className={
          "flex items-center justify-center rounded border border-danger-300 bg-danger-50 " +
          className
        }
        style={{ width: size, height: size }}
        title="Image failed to load"
      >
        <AlertTriangle className="h-4 w-4 text-danger-700" />
      </div>
    );
  }

  // Good: real image
  if (url) {
    return (
      <div
        className={"overflow-hidden rounded border border-ink-200 bg-ink-50 " + className}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      </div>
    );
  }

  // No URL: emoji fallback
  const emoji = getCategoryEmoji(slug);
  if (emoji !== "📦") {
    return (
      <div
        className={
          "flex items-center justify-center rounded border border-ink-200 bg-primary-50 text-base " +
          className
        }
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{emoji}</span>
      </div>
    );
  }

  // Last-resort neutral (slug has no emoji either)
  return (
    <div
      className={
        "flex items-center justify-center rounded bg-primary-100 text-primary-700 " +
        className
      }
      style={{ width: size, height: size }}
    >
      <Tag className="h-4 w-4" />
    </div>
  );
}
