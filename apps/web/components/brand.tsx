"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

/**
 * XovenMart brand identity components.
 *
 * Three pieces:
 *   1. <BrandMark />       — square brand icon (uses inline SVG). Works everywhere.
 *   2. <BrandLogo />       — full logo lockup (PNG if present, else inline SVG fallback).
 *   3. <BrandHeader />     — header-style logo + wordmark combo.
 *
 * The PNG (XovenMart logo.png) is expected to be placed at /public/logo.png
 * (a copy of `E:\App Ideas\XovenMart v1\XovenMart logo.png`). When unavailable,
 * the components transparently fall back to the inline BrandMark SVG so the
 * site never breaks.
 */

interface BrandLogoProps {
  /**
   * Admin-controlled logo URL. When set (and non-empty), this is
   * rendered via next/image instead of the inline SVG fallback. The
   * admin uploads via `/admin/brand-assets/upload` (kind=logo) which
   * writes to a Coolify-mounted volume and returns a public URL. Empty
   * string = use the SVG fallback.
   */
  src?: string;
  /**
   * If you want to force the SVG fallback (e.g. when neither the
   * admin URL nor the public bundle's /logo.png is available), set
   * this to true.
   */
  forceSvg?: boolean;
  className?: string;
  /**
   * Width override. The Next/Image component needs explicit dims for non-fill
   * layouts. The natural aspect ratio of the source PNG is ~4:3 (380x296).
   */
  width?: number;
  height?: number;
  priority?: boolean;
}

/**
 * <BrandLogo /> — full lockup (icon + wordmark + tagline) for hero zones,
 * login pages, and footer.
 *
 * Strategy (in order):
 *  1. If `src` is provided (admin uploaded a custom logo), render that
 *     via next/image.
 *  2. Else, try `/logo.png` (legacy hard-coded file in /public/).
 *  3. Else, render the SVG fallback so the brand is always shown.
 */
export function BrandLogo({
  src,
  forceSvg = false,
  className,
  width = 220,
  height = 64,
  priority = false,
}: BrandLogoProps) {
  const [pngOk, setPngOk] = React.useState(!forceSvg && !src);
  const [adminOk, setAdminOk] = React.useState(true);

  // Admin-controlled logo takes priority. If the URL errors out (404,
  // hot-reload during upload, etc.) we drop down to the bundle PNG.
  if (src && adminOk) {
    return (
      <Image
        src={src}
        alt="XovenMart — যা চান, যখন চান"
        width={width}
        height={height}
        priority={priority}
        className={className}
        onError={() => setAdminOk(false)}
        style={{
          height: "auto",
          width: `${width}px`,
          maxWidth: "100%",
          objectFit: "contain",
        }}
      />
    );
  }

  if (!pngOk) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 380 100"
        width={width}
        height={Math.round((width * 100) / 380)}
        className={className}
        role="img"
        aria-label="XovenMart — যা চান, যখন চান"
      >
        {/* Icon */}
        <g transform="translate(8, 10)">
          <rect width="80" height="80" rx="18" fill="#16A34A" />
          <path d="M 18 18 L 56 56" stroke="#FAF7F2" strokeWidth="9" strokeLinecap="round" />
          <path d="M 62 18 L 24 56" stroke="#FAF7F2" strokeWidth="9" strokeLinecap="round" />
          <polygon points="18,18 28,20 20,28" fill="#FACC15" />
          <polygon points="62,18 52,20 60,28" fill="#FACC15" />
          <polygon points="56,56 46,54 54,46" fill="#FACC15" />
          <polygon points="24,56 34,54 26,46" fill="#FACC15" />
          <circle cx="40" cy="37" r="11" fill="#F97316" />
          <text x="40" y="42" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FAF7F2">
            জ
          </text>
        </g>

        {/* Wordmark */}
        <text x="100" y="48" fontSize="26" fontWeight="800" fill="#1F2937" fontFamily="Inter, system-ui">
          XovenMart
        </text>
        {/* Bangla subtitle */}
        <text x="100" y="68" fontSize="14" fontWeight="700" fill="#16A34A" fontFamily="Hind Siliguri, Noto Sans Bengali, sans-serif">
          জোভেনমার্ট
        </text>
        {/* Tagline */}
        <text x="100" y="86" fontSize="10" fill="#1F2937" fontFamily="Hind Siliguri, Noto Sans Bengali, sans-serif">
          যা চান, যখন চান
        </text>
      </svg>
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="XovenMart — যা চান, যখন চান"
      width={width}
      height={height}
      priority={priority}
      className={className}
      onError={() => setPngOk(false)}
      style={{
        height: "auto",
        width: `${width}px`,
        maxWidth: "100%",
        objectFit: "contain",
      }}
    />
  );
}

/**
 * <BrandHeader /> — Header-style brand: small BrandMark icon + wordmark text.
 * Use this in tight slots like admin sidebar (where the full logo is too wide).
 *
 * Variant "dark" is intended for dark navy backgrounds (admin sidebar).
 *
 * `logoUrl` / `logoDarkUrl` are admin-controlled URLs from
 * `/settings/public/general.brand`. When provided, the icon is replaced
 * with the uploaded image (height-locked to `iconSize`).
 */
export function BrandHeader({
  variant = "light",
  href,
  className,
  showTagline = true,
  logoUrl,
  logoDarkUrl,
  iconSize = 36,
}: {
  variant?: "light" | "dark";
  href?: string;
  className?: string;
  showTagline?: boolean;
  /** Light-mode logo URL (admin upload). Empty = use BrandMark. */
  logoUrl?: string;
  /** Dark-mode logo URL (admin upload). Empty = use BrandMark. */
  logoDarkUrl?: string;
  /** Height/width of the icon (or uploaded logo). */
  iconSize?: number;
}) {
  // Pick which admin logo to use based on theme. The `dark:` Tailwind
  // variant flips the visibility of two stacked images — we render
  // BOTH and let CSS hide the inactive one. This avoids hydration
  // mismatch from a client-only theme read.
  const inner = (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {logoUrl || logoDarkUrl ? (
        <span
          className="relative inline-block"
          style={{ width: iconSize, height: iconSize }}
        >
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="XovenMart"
              width={iconSize}
              height={iconSize}
              className={`object-contain ${
                logoDarkUrl ? "dark:hidden" : ""
              }`}
              style={{ width: iconSize, height: iconSize }}
            />
          )}
          {logoDarkUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDarkUrl}
              alt="XovenMart"
              width={iconSize}
              height={iconSize}
              className="object-contain hidden dark:inline-block"
              style={{ width: iconSize, height: iconSize }}
            />
          )}
        </span>
      ) : (
        <BrandMark size={iconSize} />
      )}
      <div className="min-w-0 leading-tight">
        <div
          className={`truncate font-extrabold tracking-tight ${
            variant === "dark"
              ? "text-white"
              : "text-primary-900 dark:text-ink-50"
          }`}
          style={{ fontSize: "16px" }}
        >
          XovenMart
        </div>
        {showTagline && (
          <div
            className={`truncate text-[11px] ${
              variant === "dark"
                ? "text-primary-200"
                : "text-ink-500 dark:text-ink-400"
            }`}
            style={{ fontFamily: "var(--font-hind-siliguri)" }}
          >
            জোভেনমার্ট
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center">
        {inner}
      </Link>
    );
  }
  return inner;
}