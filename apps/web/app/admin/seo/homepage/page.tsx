"use client";

import { SeoPage, type SeoSection } from "../_components/seo-page";

const SECTIONS: SeoSection[] = [
  {
    key: "homepage",
    titleBn: "হোমপেজ মেটা",
    titleEn: "Homepage Meta",
    descBn: "হোমপেজে Google সার্চ রেজাল্টে যা দেখাবে",
    descEn: "How homepage appears in Google search results",
    fields: [
      { path: "homepage.titleBn", labelBn: "টাইটেল (বাংলা)", labelEn: "Title (Bangla)", hintBn: "৫০-৬০ অক্ষর", hintEn: "50-60 characters" },
      { path: "homepage.titleEn", labelBn: "টাইটেল (ইংরেজি)", labelEn: "Title (English)", hintBn: "৫০-৬০ অক্ষর", hintEn: "50-60 characters" },
      { path: "homepage.descriptionBn", labelBn: "ডেসক্রিপশন (বাংলা)", labelEn: "Description (Bangla)", type: "textarea", hintBn: "১৪০-১৬০ অক্ষর", hintEn: "140-160 characters" },
      { path: "homepage.descriptionEn", labelBn: "ডেসক্রিপশন (ইংরেজি)", labelEn: "Description (English)", type: "textarea", hintBn: "১৪০-১৬০ অক্ষর", hintEn: "140-160 characters" },
      { path: "homepage.keywords", labelBn: "কিওয়ার্ড", labelEn: "Keywords", type: "textarea", hintBn: "কমা দিয়ে আলাদা করুন", hintEn: "Comma-separated" },
      { path: "homepage.canonicalUrl", labelBn: "ক্যানোনিক্যাল URL", labelEn: "Canonical URL", type: "url" },
      { path: "homepage.ogImageUrl", labelBn: "OG ছবি (হোমপেজ)", labelEn: "OG Image (Homepage)", type: "url" },
    ],
  },
];

export default function SeoHomepagePage() {
  return (
    <SeoPage
      titleBn="হোমপেজ SEO"
      titleEn="Homepage SEO"
      descBn="হোমপেজের মেটা ট্যাগ ও সোশ্যাল শেয়ার সেটিংস"
      descEn="Meta tags and social sharing settings for the homepage"
      sections={SECTIONS}
      scope="homepage"
    />
  );
}
