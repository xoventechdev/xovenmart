"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Public marketing payload fetched from `GET /settings/public/general`.
 * Combines the admin-editable "general" settings that the original
 * `delivery/public` endpoint doesn't cover — store info, social links,
 * currency, tax, the home hero title/subtitle, the trust-badge copy,
 * the footer copy, and the header search placeholder.
 *
 * Why this is a SEPARATE endpoint from /delivery/public:
 *   - Delivery-public is hot-path data the user site fetches on every
 *     page mount to render the header / footer. Bundling all settings
 *     into one response would make it slow when only the promise text
 *     changed.
 *   - Keeping concerns split lets future Android clients pull only what
 *     they need.
 *
 * IMPORTANT — fallback semantics:
 *   • All text fields fall back to the same strings the legacy hardcoded
 *     site rendered, so the user site never goes blank if the API is
 *     down or slow to respond.
 *   • Social / empty fields fall back to "" so the UI can decide to
 *     hide empty icons.
 *   • `currency.code` defaults to "BDT", `currency.symbol` to "৳".
 *   • `tax.vatPercent` defaults to 0 (no VAT).
 *
 * Cached for 5 minutes by TanStack Query; an explicit
 * `qc.invalidateQueries({ queryKey: ["settings", "public", "general"] })`
 * after an admin save forces a refresh.
 */

export interface GeneralStore {
  nameEn: string;
  nameBn: string;
  phone: string;
  email: string;
  addressEn: string;
  addressBn: string;
}

export interface GeneralSocial {
  facebook: string;
  instagram: string;
  youtube: string;
  twitter: string;
}

export interface GeneralCurrency {
  code: string;
  symbol: string;
}

export interface GeneralTax {
  vatPercent: number;
  inclusive: boolean;
}

export interface GeneralHero {
  titleEn: string;
  titleBn: string;
  subtitleEn: string;
  subtitleBn: string;
  ctaShopEn: string;
  ctaShopBn: string;
  ctaOffersEn: string;
  ctaOffersBn: string;
}

export interface GeneralTrustBadge {
  icon: "Truck" | "Shield" | "Phone" | "Clock";
  bn: string;
  en: string;
  titleBn: string;
  titleEn: string;
}

export interface GeneralFooter {
  aboutEn: string;
  aboutBn: string;
  copyrightEn: string;
  copyrightBn: string;
}

export interface GeneralHeader {
  searchPlaceholderEn: string;
  searchPlaceholderBn: string;
}

export interface GeneralHomePage {
  /** Max number of products the home-page "Popular Products" carousel
   *  shows. The backend `/catalog/products/featured` endpoint caps this
   *  at 50 server-side; the frontend uses it as the slice length. */
  popularCount: number;
}

export interface GeneralContact {
  /** Human-readable phone shown on About page (Bengali digits OK). */
  phoneDisplay: string;
  /** E.164 form used in `tel:` hrefs so mobile dialers work. */
  phoneTel: string;
  /**
   * E.164 form used in `wa.me/<number>` hrefs (NO leading "+" — wa.me
   * expects just digits, e.g. "8801720694513"). Defaults to phoneTel
   * with the "+" stripped when the admin hasn't set this explicitly.
   * Empty string means "do not render the WhatsApp tile".
   */
  whatsapp: string;
  /** Human-readable email shown on About page. */
  emailDisplay: string;
  /** Lowercased form used in `mailto:` hrefs. */
  emailTo: string;
  /** Business hours in Bangla. */
  hoursBn: string;
  /** Business hours in English. */
  hoursEn: string;
}

export interface GeneralSettings {
  store: GeneralStore;
  social: GeneralSocial;
  currency: GeneralCurrency;
  tax: GeneralTax;
  hero: GeneralHero;
  trustBadges: GeneralTrustBadge[];
  footer: GeneralFooter;
  header: GeneralHeader;
  homePage: GeneralHomePage;
  contact: GeneralContact;
}

// ----- Defaults matching what the legacy hardcoded site rendered -----
// These are also returned verbatim by the backend when the admin hasn't
// customized the setting yet, so they double as a defensive client-side
// fallback when the API is unreachable.

const FALLBACK_GENERAL: GeneralSettings = {
  store: {
    nameEn: "XovenMart",
    nameBn: "জোভেনমার্ট",
    phone: "+8801720694513",
    email: "support@xovenmart.com",
    addressEn: "Mudafarganj Bazar, Laksam, Cumilla",
    addressBn: "মুদাফরগঞ্জ বাজার, লাকসাম, কুমিল্লা",
  },
  social: {
    facebook: "",
    instagram: "",
    youtube: "",
    twitter: "",
  },
  currency: {
    code: "BDT",
    symbol: "৳",
  },
  tax: {
    vatPercent: 0,
    inclusive: false,
  },
  hero: {
    titleEn: "Fresh products at your door in {minutes} minutes",
    titleBn: "তাজা পণ্য {minutes} মিনিটে দোরগোড়ায়",
    subtitleEn: "{marketingLine} — Cash on delivery",
    subtitleBn: "{marketingLine} — ক্যাশ অন ডেলিভারি",
    ctaShopEn: "Shop now",
    ctaShopBn: "এখনই কিনুন",
    ctaOffersEn: "View offers",
    ctaOffersBn: "অফার দেখুন",
  },
  trustBadges: [
    {
      icon: "Truck",
      bn: "৩০ মিনিটে",
      en: "in 30 min",
      titleBn: "দ্রুত ডেলিভারি",
      titleEn: "Fast delivery",
    },
    {
      icon: "Shield",
      bn: "ক্যাশ + বিকাশ/নগদ",
      en: "COD + bKash/Nagad",
      titleBn: "নিরাপদ পেমেন্ট",
      titleEn: "Safe payment",
    },
    {
      icon: "Phone",
      bn: "২৪/৭ সাপোর্ট",
      en: "24/7 support",
      titleBn: "সাপোর্ট",
      titleEn: "Customer support",
    },
    {
      icon: "Clock",
      bn: "তাজা গ্যারান্টি",
      en: "Fresh guarantee",
      titleBn: "তাজা পণ্য",
      titleEn: "Fresh products",
    },
  ],
  footer: {
    aboutEn:
      "Bangladesh's fastest neighbourhood delivery — groceries, daily essentials, fresh produce, and more.",
    aboutBn:
      "বাংলাদেশের দ্রুততম প্রতিবেশী ডেলিভারি — মুদি, দৈনন্দিন প্রয়োজনীয় জিনিস, তাজা পণ্য এবং আরও অনেক কিছু।",
    copyrightEn: "© 2026 XovenMart. All rights reserved.",
    copyrightBn: "© ২০২৬ জোভেনমার্ট। সর্বস্বত্ব সংরক্ষিত।",
  },
  header: {
    searchPlaceholderEn: "Search products... e.g. rice, oil, vegetables",
    searchPlaceholderBn: "পণ্য খুঁজুন... যেমন চাল, তেল, সবজি",
  },
  homePage: {
    popularCount: 12,
  },
  contact: {
    // Full Latin/English digits, including the country code (`+880`).
    // Admin typically saves the support number without the country code
    // (e.g. `01892432335`), and the backend prepends `+880` so the
    // displayed value is always in English — readable to anyone,
    // regardless of script preference. Server-side rule lives in
    // `general.public.controller.ts`; this fallback only fires when
    // the API is unreachable or the request is still pending.
    phoneDisplay: "+8801710000000",
    phoneTel: "+8801710000000",
    // Strip the leading "+" — wa.me/880xxxxxxxxxx form. Falls back to
    // phoneTel-derived digits so the floating Support widget works
    // before the admin edits contact.whatsapp.
    whatsapp: "8801710000000",
    emailDisplay: "hello@xovenmart.com",
    emailTo: "hello@xovenmart.com",
    hoursBn: "সকাল ৮টা — রাত ১০টা (প্রতিদিন)",
    hoursEn: "8 AM — 10 PM (every day)",
  },
};

/**
 * Hook used by every public page that wants to render admin-editable
 * general settings (store name, phone, email, footer copy, hero text,
 * trust badges, etc.). Returns the data with safe fallbacks so the page
 * still renders before the API responds (or if it fails).
 */
export function useGeneralSettings() {
  const q = useQuery({
    queryKey: ["settings", "public", "general"],
    queryFn: async () => {
      const base =
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
          /\/api\/v\d+\/?$/,
          "",
        );
      const res = await fetch(`${base}/api/v1/settings/public/general`);
      if (!res.ok) throw new Error("Failed to load general settings");
      return (await res.json()) as GeneralSettings;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const data = q.data;

  // Deep-merge with fallback so a partial payload (e.g. admin deleted a
  // row) still leaves the UI fully populated.
  const merged: GeneralSettings = data
    ? {
        store: { ...FALLBACK_GENERAL.store, ...(data.store ?? {}) },
        social: { ...FALLBACK_GENERAL.social, ...(data.social ?? {}) },
        currency: { ...FALLBACK_GENERAL.currency, ...(data.currency ?? {}) },
        tax: { ...FALLBACK_GENERAL.tax, ...(data.tax ?? {}) },
        hero: { ...FALLBACK_GENERAL.hero, ...(data.hero ?? {}) },
        trustBadges: data.trustBadges?.length
          ? data.trustBadges
          : FALLBACK_GENERAL.trustBadges,
        footer: { ...FALLBACK_GENERAL.footer, ...(data.footer ?? {}) },
        header: { ...FALLBACK_GENERAL.header, ...(data.header ?? {}) },
        homePage: {
          popularCount:
            Number((data as any).homePage?.popularCount) ||
            FALLBACK_GENERAL.homePage.popularCount,
        },
        contact: {
          ...FALLBACK_GENERAL.contact,
          ...((data as any).contact ?? {}),
        },
      }
    : FALLBACK_GENERAL;

  return {
    ...merged,
    isLoading: q.isLoading,
  };
}

/** Like `useGeneralSettings()` but used inside SSR-friendly helpers.
 * Same hook; just a stable alias for consistency with the other
 * `useXxxSafe` hooks (useDeliveryPublicSafe / useNoticesPublicSafe).
 *
 * NOTE: The try/catch does NOT actually protect against missing
 * QueryClient — React's hook check happens before any catch can run.
 * The "safe" variants simply give a stable name so call sites read
 * consistently. They require being called inside the QueryClientProvider
 * (which is wired into the root `Providers` component).
 */
export function useGeneralSettingsSafe(): ReturnType<typeof useGeneralSettings> {
  return useGeneralSettings();
}

/** Synchronous fallback used by SSR / error paths. */
export const FALLBACK_GENERAL_FULL: ReturnType<typeof useGeneralSettings> = {
  ...FALLBACK_GENERAL,
  isLoading: false,
};