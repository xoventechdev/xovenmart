import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";

// `AppSettings` is a flat key-value map on the backend, but the admin
// UI stores keys with dotted namespaces (`store.nameEn`, `hero.titleBn`,
// etc.) for readability in the settings table. Cast to a string-keyed
// map so TS lets us index by dotted keys without 7053 errors.
type SettingsMap = Record<string, unknown>;

function pick<T>(all: SettingsMap, key: string, fallback: T): T {
  const v = all[key];
  return (v === undefined || v === null ? fallback : (v as T));
}

/**
 * Public endpoint for the user-facing site (web + Android) to fetch the
 * admin-editable *general* settings that the original `delivery/public`
 * endpoint doesn't cover — store info, social links, currency, tax, the
 * home hero title/subtitle, the trust-badge copy, etc.
 *
 * Why this is a separate controller instead of merging into
 * `delivery/public`:
 *   - Delivery-public is hot-path data the user site fetches on every
 *     page mount to render the header / footer. Bundling all settings
 *     into one response would make it slow when only the promise text
 *     changed.
 *   - Keeping concerns split lets future Android clients pull only what
 *     they need.
 *
 * No auth — these are safe public settings. Values fall back to safe
 * defaults when the admin hasn't customized them yet.
 */
@ApiTags("settings")
@Controller("settings")
export class SettingsGeneralPublicController {
  constructor(private readonly settings: SettingsService) {}

  @Get("public/general")
  async getPublicGeneral() {
    const all = (await this.settings.getAll()) as unknown as SettingsMap;

    // Trust-badge icon allowlist (mirrors the frontend `home-view.tsx`
    // resolver) — anything outside this set is silently rejected on read
    // so the public site always receives a recognised lucide icon name.
    // Lifted to function scope so we don't try to declare a `const`
    // inside an object literal (which is a syntax error).
    const ICON_ALLOWLIST = ["Truck", "Shield", "Phone", "Clock"] as const;
    type TrustIcon = (typeof ICON_ALLOWLIST)[number];
    // Reads `trustBadge.<slot>Icon` from AppSettings and falls back to
    // the previous hardcoded default for that slot. Rejects values
    // that aren't in the allowlist (e.g. if a stray write ever
    // inserted a bad value) so the frontend always receives a
    // recognised icon name.
    const pickIcon = (key: string, fallback: TrustIcon): TrustIcon => {
      const raw = pick<string>(all, key, fallback);
      return (ICON_ALLOWLIST as readonly string[]).includes(raw)
        ? (raw as TrustIcon)
        : fallback;
    };

    return {
      // Brand assets — admin-controllable URLs to the site's logo,
      // dark-mode logo, favicon, and Open Graph share image. The
      // admin panel uploads files via `/admin/brand-assets/upload`
      // which writes them to a Coolify-mounted volume and returns a
      // public URL (e.g. `https://api.xovenmart.com/static/brand/<file>`).
      // Consumers (root layout metadata, header/footer, admin sidebar)
      // fall back to the inline BrandMark SVG when these URLs are
      // empty so the site never breaks if the admin hasn't uploaded
      // anything yet.
      brand: {
        logoUrl: pick<string>(all, "brand.logoUrl", ""),
        logoDarkUrl: pick<string>(all, "brand.logoDarkUrl", ""),
        faviconUrl: pick<string>(all, "brand.faviconUrl", ""),
        ogImageUrl: pick<string>(all, "brand.ogImageUrl", ""),
        taglineBn: pick<string>(all, "brandTaglineBn", "যা চান, যখন চান"),
        taglineEn: pick<string>(
          all,
          "brandTaglineEn",
          "Whatever you need, whenever you need it",
        ),
      },

      // Store identity (admin-editable; used by header / footer /
      // contact page so admin can change the contact info without a
      // code deploy).
      store: {
        nameEn: pick<string>(all, "store.nameEn", "XovenMart"),
        nameBn: pick<string>(all, "store.nameBn", "জোভেনমার্ট"),
        phone:
          pick<string>(all, "store.phone", "") ||
          pick<string>(all, "supportPhone", "+8801720694513"),
        email:
          pick<string>(all, "store.email", "") ||
          pick<string>(all, "supportEmail", "support@xovenmart.com"),
        addressEn: pick<string>(
          all,
          "store.addressEn",
          "Mudafarganj Bazar, Laksam, Cumilla",
        ),
        addressBn: pick<string>(
          all,
          "store.addressBn",
          "মুদাফরগঞ্জ বাজার, লাকসাম, কুমিল্লা",
        ),
      },

      // Social links — admin can paste the brand's handles here and the
      // footer/social column picks them up automatically. Empty strings
      // mean "do not render" rather than a dead link.
      social: {
        facebook: pick<string>(all, "social.facebook", ""),
        instagram: pick<string>(all, "social.instagram", ""),
        youtube: pick<string>(all, "social.youtube", ""),
        twitter: pick<string>(all, "social.twitter", ""),
      },

      // Currency — admin can switch the site to USD/INR without a
      // code deploy; consumers must format prices with this symbol
      // and code (default ৳ / BDT).
      currency: {
        code: pick<string>(all, "currency.code", "BDT"),
        symbol: pick<string>(all, "currency.symbol", "৳"),
      },

      // Tax — included for transparency on receipts. The cart/checkout
      // already reads these from `useFeatureToggles` on the admin
      // toggle, but exposing them publicly lets the footer / FAQ page
      // reference the rate without hardcoding.
      tax: {
        vatPercent: Number(pick<number>(all, "tax.vatPercent", 0)),
        inclusive: pick<boolean>(all, "tax.inclusive", false) === true,
      },

      // Home hero — admin-editable title/subtitle text so marketing
      // can A/B test copy without a code deploy. Defaults to the same
      // text the previous hardcoded home page rendered.
      hero: {
        titleEn: pick<string>(
          all,
          "hero.titleEn",
          "Fresh products at your door in {minutes} minutes",
        ),
        titleBn: pick<string>(
          all,
          "hero.titleBn",
          "তাজা পণ্য {minutes} মিনিটে দোরগোড়ায়",
        ),
        subtitleEn: pick<string>(
          all,
          "hero.subtitleEn",
          "{marketingLine} — Cash on delivery",
        ),
        subtitleBn: pick<string>(
          all,
          "hero.subtitleBn",
          "{marketingLine} — ক্যাশ অন ডেলিভারি",
        ),
        ctaShopEn: pick<string>(all, "hero.ctaShopEn", "Shop now"),
        ctaShopBn: pick<string>(all, "hero.ctaShopBn", "এখনই কিনুন"),
        ctaOffersEn: pick<string>(all, "hero.ctaOffersEn", "View offers"),
        ctaOffersBn: pick<string>(all, "hero.ctaOffersBn", "অফার দেখুন"),
      },

      // Trust badges (the row of 4 small icons under the hero). All
      // bilingual, all admin-editable. The icon key maps to a lucide
      // icon on the frontend (Truck / Shield / Phone / Clock) — the
      // allowlist is enforced both in the admin form's `<select>`
      // options and here on read, so a stray value can never reach the
      // frontend and crash the icon resolver. `pickIcon` is defined in
      // the enclosing function scope above.
      trustBadges: [
        {
          icon: pickIcon("trustBadge.fastIcon", "Truck"),
          // First badge is always dynamic from deliveryPromiseLabelEn/Bn,
          // but admins can override here if they want different copy.
          bn: pick<string>(
            all,
            "trustBadge.fastBn",
            `${pick<number>(all, "deliveryPromiseMinutes", 30)} মিনিটে`,
          ),
          en: pick<string>(
            all,
            "trustBadge.fastEn",
            `in ${pick<number>(all, "deliveryPromiseMinutes", 30)} min`,
          ),
          titleBn: pick<string>(
            all,
            "trustBadge.fastTitleBn",
            "দ্রুত ডেলিভারি",
          ),
          titleEn: pick<string>(
            all,
            "trustBadge.fastTitleEn",
            "Fast delivery",
          ),
        },
        {
          icon: pickIcon("trustBadge.paymentIcon", "Shield"),
          bn: pick<string>(all, "trustBadge.paymentBn", "ক্যাশ + বিকাশ/নগদ"),
          en: pick<string>(all, "trustBadge.paymentEn", "COD + bKash/Nagad"),
          titleBn: pick<string>(
            all,
            "trustBadge.paymentTitleBn",
            "নিরাপদ পেমেন্ট",
          ),
          titleEn: pick<string>(
            all,
            "trustBadge.paymentTitleEn",
            "Safe payment",
          ),
        },
        {
          icon: pickIcon("trustBadge.supportIcon", "Phone"),
          bn: pick<string>(all, "trustBadge.supportBn", "২৪/৭ সাপোর্ট"),
          en: pick<string>(all, "trustBadge.supportEn", "24/7 support"),
          titleBn: pick<string>(all, "trustBadge.supportTitleBn", "সাপোর্ট"),
          titleEn: pick<string>(
            all,
            "trustBadge.supportTitleEn",
            "Customer support",
          ),
        },
        {
          icon: pickIcon("trustBadge.freshIcon", "Clock"),
          bn: pick<string>(all, "trustBadge.freshBn", "তাজা গ্যারান্টি"),
          en: pick<string>(all, "trustBadge.freshEn", "Fresh guarantee"),
          titleBn: pick<string>(all, "trustBadge.freshTitleBn", "তাজা পণ্য"),
          titleEn: pick<string>(
            all,
            "trustBadge.freshTitleEn",
            "Fresh products",
          ),
        },
      ],

      // Footer copy — admin can rewrite any of these. Empty strings
      // fall back to the values the legacy hardcoded footer used.
      footer: {
        aboutEn: pick<string>(
          all,
          "footer.aboutEn",
          "Bangladesh's fastest neighbourhood delivery — groceries, daily essentials, fresh produce, and more.",
        ),
        aboutBn: pick<string>(
          all,
          "footer.aboutBn",
          "বাংলাদেশের দ্রুততম প্রতিবেশী ডেলিভারি — মুদি, দৈনন্দিন প্রয়োজনীয় জিনিস, তাজা পণ্য এবং আরও অনেক কিছু।",
        ),
        copyrightEn: pick<string>(
          all,
          "footer.copyrightEn",
          "© 2026 XovenMart. All rights reserved.",
        ),
        copyrightBn: pick<string>(
          all,
          "footer.copyrightBn",
          "© ২০২৬ জোভেনমার্ট। সর্বস্বত্ব সংরক্ষিত।",
        ),
      },

      // Header copy
      header: {
        searchPlaceholderEn: pick<string>(
          all,
          "header.searchPlaceholderEn",
          "Search products... e.g. rice, oil, vegetables",
        ),
        searchPlaceholderBn: pick<string>(
          all,
          "header.searchPlaceholderBn",
          "পণ্য খুঁজুন... যেমন চাল, তেল, সবজি",
        ),
      },

      // Home page copy + layout knobs. Admin can change how many items
      // the "Popular Products" carousel shows without a code deploy.
      // The /catalog/products/featured endpoint reads this server-side
      // too (default 12, capped at 50) so the list size stays in sync
      // with the carousel that renders them.
      homePage: {
        popularCount: Number(pick(all, "homePage.popularCount", 12) as number),
      },

      // Contact info shown on the About page (and anywhere else that
      // needs the shop's phone / email / hours). Admin can rewrite any
      // of these without a code deploy. Display strings are kept
      // separate from the canonical store.phone / store.email so the
      // admin can show one number publicly while routing calls/orders
      // to a different internal number.
      contact: {
        // Display strings — what the user sees on the card. Falls back
        // to the admin "Support Phone" setting (saved under `supportPhone`)
        // so the existing admin form just works without any migration.
        //
        // Format: full Latin/English digits, including the country code
        // (`+880`). Admin typically saves the support number without a
        // country code (e.g. `01892432335`), so we strip any leading
        // `0` / `880` / `৮৮০` and prepend `+880`. The result is always
        // in English/Latin so anyone — Bengali or English reader — sees
        // the same readable digits. Empty `supportPhone` falls back to
        // a Latin seed default.
        //
        // Defensive normalization: an admin may have pasted the digits
        // in Bengali (e.g. "০১৮৯২৪৩২৩৩৫"), so we map every Bengali digit
        // back to Latin before prepending `+880`. Without this, a body
        // in Bengali would mix scripts and confuse the reader.
        phoneDisplay: (() => {
          // `bn2en` walks a string and replaces only Bengali digits with
          // their Latin equivalents, leaving every other character
          // (including `+`) intact.
          const bn2en = (s: string) =>
            s.replace(/[০১২৩৪৫৬৭৮৯]/g, (d) =>
              "০১২৩৪৫৬৭৮৯".indexOf(d).toString(),
            );
          const supportPhone = pick<string>(all, "supportPhone", "");
          if (supportPhone) {
            const latin = bn2en(supportPhone);
            return "+880" + latin.replace(/^৮৮০|^880|^0/, "");
          }
          return "+8801710000000";
        })(),
        // tel: href value — E.164 form for native dialers. Same fallback
        // chain as the display string so editing the admin Support Phone
        // updates both the visible text and the dialed number.
        phoneTel: (() => {
          const explicit = pick<string>(all, "contact.phoneTel", "");
          if (explicit) return explicit;
          const supportPhone = pick<string>(all, "supportPhone", "");
          if (supportPhone) {
            // If admin saved "01720694513" prepend +880; if they
            // already saved with country code, leave alone. If neither,
            // fall back to the seed default.
            if (/^৮৮০|^880/.test(supportPhone)) {
              return "+" + supportPhone.replace(/^\+/, "");
            }
            return "+880" + supportPhone.replace(/^0/, "");
          }
          return "+8801710000000";
        })(),
        // WhatsApp number in E.164 form (e.g. "8801720694513" — no "+"
        // or "@"). Used by the public floating Support widget to deep-
        // link into wa.me. Reads from `contact.whatsapp` first; falls
        // back to the legacy `whatsappNumber` setting that the admin
        // contact form saves; finally falls back to `phoneTel` stripped
        // of "+" so the widget always works even when nothing has been
        // configured. Empty string = "don't show WhatsApp tile".
        whatsapp: (() => {
          const explicit = pick<string>(all, "contact.whatsapp", "");
          if (explicit) return explicit;
          const legacy = pick<string>(all, "whatsappNumber", "");
          if (legacy) return legacy.replace(/^\+/, "");
          return pick<string>(all, "contact.phoneTel", "+8801710000000").replace(
            /^\+/,
            "",
          );
        })(),
        emailDisplay: pick<string>(all, "contact.emailDisplay", "hello@xovenmart.com"),
        emailTo: pick<string>(all, "contact.emailTo", "hello@xovenmart.com"),
        hoursBn: pick<string>(
          all,
          "contact.hoursBn",
          "সকাল ৮টা — রাত ১০টা (প্রতিদিন)",
        ),
        hoursEn: pick<string>(all, "contact.hoursEn", "8 AM — 10 PM (every day)"),
      },
    };
  }
}
