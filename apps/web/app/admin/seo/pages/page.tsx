"use client";

import { SeoPage, type SeoSection } from "../_components/seo-page";

/**
 * Per-page overrides for static pages: about, privacy, terms, refund, shipping.
 * These merge over the homepage/global defaults at render time.
 */
const PAGE_SLUGS = [
  { slug: "about", bn: "আমাদের সম্পর্কে", en: "About Us" },
  { slug: "privacy", bn: "গোপনীয়তা নীতি", en: "Privacy Policy" },
  { slug: "terms", bn: "ব্যবহারের শর্তাবলী", en: "Terms of Service" },
  { slug: "refund", bn: "রিফান্ড নীতি", en: "Refund Policy" },
  { slug: "shipping", bn: "ডেলিভারি নীতি", en: "Shipping Policy" },
] as const;

const sections: SeoSection[] = PAGE_SLUGS.map((p) => ({
  key: p.slug,
  titleBn: `${p.bn} — মেটা`,
  titleEn: `${p.en} — Meta`,
  descBn: `/${p.slug} পেজের জন্য SEO ট্যাগ`,
  descEn: `SEO tags for the /${p.slug} page`,
  fields: [
    { path: `pages.${p.slug}.titleBn`, labelBn: "টাইটেল (বাংলা)", labelEn: "Title (Bangla)" },
    { path: `pages.${p.slug}.titleEn`, labelBn: "টাইটেল (ইংরেজি)", labelEn: "Title (English)" },
    { path: `pages.${p.slug}.descriptionBn`, labelBn: "ডেসক্রিপশন (বাংলা)", labelEn: "Description (Bangla)", type: "textarea" },
    { path: `pages.${p.slug}.descriptionEn`, labelBn: "ডেসক্রিপশন (ইংরেজি)", labelEn: "Description (English)", type: "textarea" },
  ],
}));

export default function SeoPagesPage() {
  return (
    <SeoPage
      titleBn="পেজ-লেভেল SEO"
      titleEn="Page-level SEO"
      descBn="প্রতিটি স্ট্যাটিক পেজের (About, Privacy, Terms…) জন্য পৃথক মেটা ট্যাগ"
      descEn="Override meta tags per static page (About, Privacy, Terms, etc.)"
      sections={sections}
    />
  );
}
