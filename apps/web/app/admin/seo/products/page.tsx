"use client";

import { SeoPage, type SeoSection } from "../_components/seo-page";

const SECTIONS: SeoSection[] = [
  {
    key: "products",
    titleBn: "পণ্য পেজ SEO ডিফল্ট",
    titleEn: "Product Page SEO Defaults",
    descBn: "প্রতিটি পণ্যের জন্য স্বয়ংক্রিয়ভাবে তৈরি হওয়া SEO ট্যাগের টেমপ্লেট",
    descEn: "Templates that auto-generate SEO tags for every product",
    fields: [
      { path: "products.titleTemplateBn", labelBn: "টাইটেল টেমপ্লেট (বাংলা)", labelEn: "Title Template (BN)", hintBn: "ভেরিয়েবল: {name}, {price}, {category}", hintEn: "Vars: {name}, {price}, {category}" },
      { path: "products.titleTemplateEn", labelBn: "টাইটেল টেমপ্লেট (EN)", labelEn: "Title Template (EN)", hintBn: "Vars: {name}, {price}, {category}", hintEn: "Vars: {name}, {price}, {category}" },
      { path: "products.descriptionTemplate", labelBn: "ডেসক্রিপশন টেমপ্লেট", labelEn: "Description Template", type: "textarea", hintBn: "Vars: {name}, {salePrice}, {mrp}, {category}", hintEn: "Vars: {name}, {salePrice}, {mrp}, {category}" },
      { path: "products.keywords", labelBn: "ডিফল্ট কিওয়ার্ড", labelEn: "Default Keywords", type: "textarea" },
      { path: "products.enableProductSchema", labelBn: "Product Schema.org মার্কআপ", labelEn: "Product Schema Markup", type: "boolean", hintBn: "Google রিচ রেজাল্টের জন্য", hintEn: "Enables Google rich results" },
      { path: "products.enableBreadcrumbSchema", labelBn: "Breadcrumb Schema", labelEn: "Breadcrumb Schema", type: "boolean" },
      { path: "products.enableReviewSchema", labelBn: "Review Schema", labelEn: "Review Schema", type: "boolean" },
      { path: "products.autoGenerateAltText", labelBn: "স্বয়ংক্রিয় Alt টেক্সট", labelEn: "Auto-generate Alt Text", type: "boolean" },
      { path: "products.autoGenerateSlug", labelBn: "পণ্যের slug স্বয়ংক্রিয়?", labelEn: "Auto-generate Product Slug", type: "boolean" },
    ],
  },
];

export default function SeoProductsPage() {
  return (
    <SeoPage
      titleBn="পণ্য SEO ডিফল্ট"
      titleEn="Product SEO Defaults"
      descBn="প্রতিটি পণ্য পেজের জন্য SEO টেমপ্লেট ও Schema.org সেটিংস"
      descEn="SEO templates and Schema.org settings for product pages"
      sections={SECTIONS}
      scope="products"
    />
  );
}
