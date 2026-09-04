"use client";

import Link from "next/link";
import { MapPin, Phone, Mail } from "lucide-react";
import { BrandBlock } from "@/components/brand-block";
import { useTheme } from "@/lib/theme";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";

/**
 * Public site footer. Bilingual strings read live from `useTheme().lang`,
 * so flipping the lang toggle immediately updates the footer copy. The
 * brand tagline + service-area list are admin-editable (delivery promise
 * + zones + brand tagline).
 */
export function SiteFooter() {
  const { lang } = useTheme();
  const general = useGeneralSettingsSafe();

  // Brand tagline (admin-editable "যা চান, যখন চান" / "Whatever you need,
  // whenever you need it") — distinct from the marketing line which is the
  // full "Same-day delivery across {zones}" sentence.
  const brandTagline =
    lang === "en" ? general.brand.taglineEn : general.brand.taglineBn;

  const T = {
    quickLinks: lang === "bn" ? "দ্রুত লিঙ্ক" : "Quick Links",
    about: lang === "bn" ? "আমাদের সম্পর্কে" : "About Us",
    track: lang === "bn" ? "অর্ডার ট্র্যাক" : "Track Order",
    deals: lang === "bn" ? "অফার ও ছাড়" : "Offers & Deals",
    support: lang === "bn" ? "সহায়তা" : "Support",
    faq: lang === "bn" ? "প্রশ্নোত্তর" : "FAQ",
    contact: lang === "bn" ? "যোগাযোগ" : "Contact",
    privacy: lang === "bn" ? "গোপনীয়তা নীতি" : "Privacy Policy",
    contactTitle: lang === "bn" ? "যোগাযোগ" : "Contact",
    address:
      lang === "en" ? general.store.addressEn : general.store.addressBn,
    copyright:
      lang === "en" ? general.footer.copyrightEn : general.footer.copyrightBn,
  };

  return (
    <footer className="bg-ink-900 text-ink-100 mt-12">
      <div className="container mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          {/* Smart brand block — logo OR text stack, never both. The
              component decides which based on the live brand payload. */}
          <div className="mb-3">
            <BrandBlock
              brand={{
                logoUrl: general.brand.logoUrl,
                logoDarkUrl: general.brand.logoDarkUrl,
                nameEn: general.store.nameEn,
                nameBn: general.store.nameBn,
                taglineEn: general.brand.taglineEn,
                taglineBn: general.brand.taglineBn,
              }}
              lang={lang}
              variant="footer"
              className="inline-flex items-center gap-2"
            />
          </div>
          {/* Footer "About" copy — the admin-editable long description
              (distinct from the short brand tagline which the BrandBlock
              already renders when no logo is set). */}
          <p className="text-sm text-ink-300">
            {lang === "en" ? general.footer.aboutEn : general.footer.aboutBn}
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-3">{T.quickLinks}</h4>
          <ul className="space-y-2 text-sm text-ink-300">
            <li><Link href="/about" className="hover:text-white">{T.about}</Link></li>
            <li><Link href="/track" className="hover:text-white">{T.track}</Link></li>
            <li><Link href="/deals" className="hover:text-white">{T.deals}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold mb-3">{T.support}</h4>
          <ul className="space-y-2 text-sm text-ink-300">
            <li><Link href="/faq" className="hover:text-white">{T.faq}</Link></li>
            <li><Link href="/contact" className="hover:text-white">{T.contact}</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-white">{T.privacy}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold mb-3">{T.contactTitle}</h4>
          <ul className="space-y-2 text-sm text-ink-300">
            <li className="flex items-center gap-2"><Phone className="h-3 w-3" /> {general.store.phone}</li>
            <li className="flex items-center gap-2"><Mail className="h-3 w-3" /> {general.store.email}</li>
            <li className="flex items-center gap-2"><MapPin className="h-3 w-3" /> {T.address}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-800 py-4 text-center text-xs text-ink-400">
        {T.copyright}
      </div>
    </footer>
  );
}
