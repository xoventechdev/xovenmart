"use client";

import * as React from "react";
import { BrandMark } from "@/components/brand-mark";

/**
 * Standalone brand lockup used by login / register / forgot-password /
 * referrals / share landing pages. Same as the inline `<BrandMark>` call
 * they used to do, but optionally substitutes the admin-uploaded logo
 * (`logoUrl` for light backgrounds, `logoDarkUrl` for dark).
 *
 * For these auth-style pages we deliberately keep it small: 36–72 px,
 * no wordmark next to it (the page already has its own title).
 *
 * No flicker: both light + dark logos are rendered with `dark:hidden` /
 * `hidden dark:inline-block` Tailwind classes so React doesn't have to
 * know the current theme. SSR + hydration stay clean.
 */
export function BrandLockup({
  size = 64,
  logoUrl,
  logoDarkUrl,
  className,
}: {
  size?: number;
  logoUrl?: string;
  logoDarkUrl?: string;
  className?: string;
}) {
  if (!logoUrl && !logoDarkUrl) {
    return (
      <span className={className} style={{ display: "inline-block" }}>
        <BrandMark size={size} />
      </span>
    );
  }
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt="XovenMart"
          width={size}
          height={size}
          className={logoDarkUrl ? "object-contain dark:hidden" : "object-contain"}
          style={{ height: size, width: "auto", maxWidth: size * 2.5 }}
        />
      )}
      {logoDarkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoDarkUrl}
          alt="XovenMart"
          width={size}
          height={size}
          className="object-contain hidden dark:inline-block"
          style={{ height: size, width: "auto", maxWidth: size * 2.5 }}
        />
      )}
    </span>
  );
}
