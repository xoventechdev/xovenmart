"use client";

import { SeoPage, type SeoSection } from "../_components/seo-page";

const SECTIONS: SeoSection[] = [
  {
    key: "global",
    titleBn: "গ্লোবাল SEO সেটিংস",
    titleEn: "Global SEO Settings",
    descBn: "সমস্ত পেজে প্রযোজ্য ডিফল্ট ভ্যালু",
    descEn: "Defaults applied to all pages",
    fields: [
      { path: "global.siteName", labelBn: "সাইটের নাম (EN)", labelEn: "Site Name (EN)", type: "text" },
      { path: "global.siteNameBn", labelBn: "সাইটের নাম (বাং)", labelEn: "Site Name (BN)" },
      { path: "global.siteUrl", labelBn: "সাইট URL", labelEn: "Site URL", type: "url", hintBn: "ট্রেইলিং স্ল্যাশ ছাড়া", hintEn: "No trailing slash" },
      { path: "global.separator", labelBn: "টাইটেল সেপারেটর", labelEn: "Title Separator", hintBn: "যেমন: |, -, •", hintEn: "e.g., |, -, •" },
      {
        path: "global.defaultLanguage",
        labelBn: "ডিফল্ট ভাষা",
        labelEn: "Default Language",
        type: "select",
        options: [
          { value: "bn", label: "বাংলা (Bangla)" },
          { value: "en", label: "English" },
        ],
      },
      { path: "global.indexable", labelBn: "সার্চ ইঞ্জিন ইনডেক্স", labelEn: "Indexable by search engines", type: "boolean" },
      { path: "global.defaultOgImageUrl", labelBn: "ডিফল্ট OG ছবি", labelEn: "Default OG Image", type: "url", hintBn: "1200×630px সুপারিশ", hintEn: "Recommended 1200×630px" },
      { path: "global.twitterHandle", labelBn: "Twitter হ্যান্ডেল", labelEn: "Twitter Handle" },
      { path: "global.facebookPageUrl", labelBn: "ফেসবুক পেজ URL", labelEn: "Facebook Page URL", type: "url" },
      { path: "global.contactEmail", labelBn: "যোগাযোগ ইমেইল", labelEn: "Contact Email", type: "email" },
      { path: "global.contactPhone", labelBn: "যোগাযোগ ফোন", labelEn: "Contact Phone" },
      { path: "global.addressLocality", labelBn: "শহর", labelEn: "Locality" },
      { path: "global.addressRegion", labelBn: "জেলা/রাজ্য", labelEn: "Region" },
      { path: "global.addressCountry", labelBn: "দেশ", labelEn: "Country" },
      { path: "global.geoLat", labelBn: "Latitude", labelEn: "Latitude", type: "number" },
      { path: "global.geoLng", labelBn: "Longitude", labelEn: "Longitude", type: "number" },
    ],
  },
];

export default function SeoGlobalPage() {
  return (
    <SeoPage
      titleBn="গ্লোবাল SEO সেটিংস"
      titleEn="Global SEO Settings"
      descBn="সাইটের সাধারণ SEO কনফিগারেশন — সমস্ত পেজে প্রযোজ্য"
      descEn="Site-wide SEO defaults applied across every page"
      sections={SECTIONS}
      scope="global"
    />
  );
}
