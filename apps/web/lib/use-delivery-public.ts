"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Public marketing payload fetched from `GET /delivery/public`. Combines
 *  - the admin-editable delivery promise (minutes + bilingual labels), and
 *  - the active delivery zones (so the UI can say "across <admin zone 1>,
 *    <admin zone 2>" without hardcoding any location names).
 *
 * IMPORTANT — fallback semantics:
 *   • Promise text (minutes + bilingual labels) ALWAYS falls back to safe
 *     hardcoded defaults so the site never goes blank if the API is down.
 *   • Zones NEVER fall back to hardcoded names. If the API is unreachable
 *     or returns 0 active zones, the UI shows a generic label like
 *     "across all service areas" instead of fabricated location names.
 *     This prevents the user site from advertising zones the admin has
 *     actually deactivated.
 *
 * Cached for 5 minutes by TanStack Query; an explicit
 * `qc.invalidateQueries({ queryKey: ["delivery", "public"] })` after an
 * admin save forces a refresh.
 */

export interface DeliveryZonePublic {
  id: string;
  nameBn: string;
  nameEn: string;
}

export interface DeliveryPublic {
  promise: {
    minutes: number;
    labelBn: string;
    labelEn: string;
  };
  /**
   * Admin-editable full marketing line. Supports a `{zones}` placeholder
   * that the UI substitutes with the active zone list. If the admin
   * hasn't customized these yet, the defaults below are used.
   */
  marketingLine: {
    bn: string;
    en: string;
  };
  /**
   * Bilingual brand tagline shown right under the logo / brand name in the
   * site header (and any other place that wants the brand one-liner).
   */
  brandTagline: {
    bn: string;
    en: string;
  };
  /**
   * When false, the checkout view bounces unauthenticated users to
   * /login. Defaults to true so existing installs stay permissive.
   */
  guestCheckoutEnabled: boolean;
  zones: DeliveryZonePublic[];
}

// Promise text is safe to hardcode (it's just a marketing tagline).
const PROMISE_FALLBACK = {
  minutes: 30,
  labelBn: "৩০ মিনিটে ডেলিভারি",
  labelEn: "30-min delivery",
};

// Marketing line defaults — match the values seeded in
// settings.service.ts `seedDefaults` / `applyDefaults`. Used as a safe
// fallback when the API hasn't responded yet (so the user site never
// shows blank/empty strings during the first paint).
const MARKETING_LINE_FALLBACK = {
  bn: "{zones} এ সেইম-ডে ডেলিভারি",
  en: "Same-day delivery across {zones}",
};

// Brand tagline defaults — shown under the logo / brand name in the site
// header (and anywhere else that wants the brand one-liner).
const BRAND_TAGLINE_FALLBACK = {
  bn: "যা চান, যখন চান",
  en: "Whatever you need, whenever you need it",
};

/**
 * Build a localized list of active zone names joined with the locale's
 * list separator + final "and"/"ও". Example outputs:
 *   en: "Mudafarganj, Laksam & Cumilla"
 *   bn: "মুদাফরগঞ্জ, লাকসাম ও কুমিল্লা"
 * Falls back to a generic "across all service areas" / "সকল সার্ভিস
 * এলাকায়" phrase when no zones are active, so we never fabricate
 * location names.
 */
export function buildZoneList(
  zones: DeliveryZonePublic[],
  lang: "bn" | "en",
): string {
  if (zones.length === 0) {
    return lang === "en" ? "all service areas" : "সকল সার্ভিস এলাকায়";
  }
  const names = zones.map((z) => (lang === "en" ? z.nameEn : z.nameBn));
  if (names.length === 1) return names[0];
  if (names.length === 2) {
    return lang === "en"
      ? `${names[0]} & ${names[1]}`
      : `${names[0]} ও ${names[1]}`;
  }
  const last = names.pop()!;
  const join = lang === "en" ? " & " : " ও ";
  return names.join(", ") + join + last;
}

/**
 * Resolve the admin-editable marketing line for a given language. The
 * admin's template supports a `{zones}` placeholder; we substitute it
 * with the active zone list (or a generic phrase if none are active).
 */
export function resolveMarketingLine(
  zones: DeliveryZonePublic[],
  lang: "bn" | "en",
  templateBn?: string,
  templateEn?: string,
): string {
  const template =
    lang === "en"
      ? templateEn ?? MARKETING_LINE_FALLBACK.en
      : templateBn ?? MARKETING_LINE_FALLBACK.bn;
  const zoneList = buildZoneList(zones, lang);
  return template.replace(/\{zones\}/g, zoneList);
}

/**
 * Hook used by every public page that wants to render the admin-editable
 * delivery promise / zone names. Returns the data with safe fallbacks so
 * the page still renders before the API responds (or if it fails).
 *
 * NOTE: `zones` will be `[]` until the API responds with at least one
 * active zone. We deliberately do NOT inject hardcoded zone names here so
 * deactivated zones never leak into the user site.
 */
export function useDeliveryPublic() {
  const q = useQuery({
    queryKey: ["delivery", "public"],
    queryFn: async () => {
      const base =
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
          /\/api\/v\d+\/?$/,
          "",
        );
      const res = await fetch(`${base}/api/v1/delivery/public`);
      if (!res.ok) throw new Error("Failed to load delivery info");
      return (await res.json()) as DeliveryPublic;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const data = q.data;

  return {
    /** Admin-configured minutes (or 30 if API hasn't responded). */
    minutes: data?.promise?.minutes ?? PROMISE_FALLBACK.minutes,
    /** Bengali badge text (or safe fallback). */
    labelBn: data?.promise?.labelBn ?? PROMISE_FALLBACK.labelBn,
    /** English badge text (or safe fallback). */
    labelEn: data?.promise?.labelEn ?? PROMISE_FALLBACK.labelEn,
    /**
     * Admin-editable full marketing line templates. The UI substitutes
     * `{zones}` with the active zone list. Falls back to safe defaults
     * (with `{zones}` still present) when the API hasn't responded.
     */
    marketingLineBn: data?.marketingLine?.bn ?? MARKETING_LINE_FALLBACK.bn,
    marketingLineEn: data?.marketingLine?.en ?? MARKETING_LINE_FALLBACK.en,
    /**
     * Bilingual brand tagline shown under the logo / brand name in the
     * site header. Falls back to safe hardcoded defaults when the API
     * hasn't responded yet.
     */
    brandTaglineBn: data?.brandTagline?.bn ?? BRAND_TAGLINE_FALLBACK.bn,
    brandTaglineEn: data?.brandTagline?.en ?? BRAND_TAGLINE_FALLBACK.en,
    /**
     * Zone names from DB (active only). Empty array until the API responds
     * and confirms there are active zones. UI must handle the empty case
     * by showing a generic label rather than fabricating names.
     */
    zones: data?.zones ?? [],
    /**
     * Admin-toggled guest checkout. Defaults to true so the user site
     * keeps allowing guest orders until an admin explicitly turns it off.
     */
    guestCheckoutEnabled: data?.guestCheckoutEnabled ?? true,
    isLoading: q.isLoading,
  };
}

/** Like `useDeliveryPublic()` but doesn't depend on QueryClient being
 * mounted — used inside SSR-friendly helpers. Returns empty zones so the
 * server-rendered HTML never invents location names. */
export function useDeliveryPublicSafe(): ReturnType<typeof useDeliveryPublic> {
  try {
    return useDeliveryPublic();
  } catch {
    return FALLBACK_PUBLIC;
  }
}

/** Synchronous fallback used by SSR / error paths. Promise text has safe
 * defaults; zones are intentionally empty so no fabricated location names
 * ever leak into the user site. */
export const FALLBACK_PUBLIC: ReturnType<typeof useDeliveryPublic> = {
  minutes: PROMISE_FALLBACK.minutes,
  labelBn: PROMISE_FALLBACK.labelBn,
  labelEn: PROMISE_FALLBACK.labelEn,
  marketingLineBn: MARKETING_LINE_FALLBACK.bn,
  marketingLineEn: MARKETING_LINE_FALLBACK.en,
  brandTaglineBn: BRAND_TAGLINE_FALLBACK.bn,
  brandTaglineEn: BRAND_TAGLINE_FALLBACK.en,
  zones: [],
  guestCheckoutEnabled: true,
  isLoading: false,
};
