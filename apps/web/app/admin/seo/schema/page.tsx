"use client";

import { SeoPage, type SeoSection } from "../_components/seo-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const SECTIONS: SeoSection[] = [
  {
    key: "schema",
    titleBn: "Schema.org মার্কআপ",
    titleEn: "Schema.org Markup",
    descBn: "Google রিচ রেজাল্টের জন্য স্ট্রাকচার্ড ডেটা",
    descEn: "Structured data for Google rich results",
    fields: [
      { path: "schema.enableProductSchema", labelBn: "Product Schema", labelEn: "Product Schema", type: "boolean" },
      { path: "schema.enableBreadcrumbSchema", labelBn: "Breadcrumb Schema", labelEn: "Breadcrumb Schema", type: "boolean" },
      { path: "schema.enableFaqSchema", labelBn: "FAQ Schema", labelEn: "FAQ Schema", type: "boolean" },
      { path: "schema.enableLocalBusinessSchema", labelBn: "LocalBusiness Schema", labelEn: "LocalBusiness Schema", type: "boolean" },
    ],
  },
  {
    key: "organization",
    titleBn: "Organization/LocalBusiness Schema",
    titleEn: "Organization/LocalBusiness Schema",
    descBn: "Organization info যা Google-এ প্রদর্শিত হবে",
    descEn: "Organization info shown in Google",
    fields: [
      { path: "schema.organization.enabled", labelBn: "সক্রিয়", labelEn: "Enabled", type: "boolean" },
      {
        path: "schema.organization.type",
        labelBn: "Schema Type",
        labelEn: "Schema Type",
        type: "select",
        options: [
          { value: "Organization", label: "Organization" },
          { value: "LocalBusiness", label: "LocalBusiness" },
          { value: "Store", label: "Store" },
          { value: "FoodEstablishment", label: "FoodEstablishment" },
        ],
      },
      { path: "schema.organization.name", labelBn: "নাম", labelEn: "Name" },
      { path: "schema.organization.alternateName", labelBn: "বিকল্প নাম", labelEn: "Alternate Name" },
      { path: "schema.organization.description", labelBn: "বিবরণ", labelEn: "Description", type: "textarea" },
      { path: "schema.organization.logoUrl", labelBn: "লোগো URL", labelEn: "Logo URL", type: "url" },
      { path: "schema.organization.foundingDate", labelBn: "প্রতিষ্ঠার তারিখ", labelEn: "Founding Date", hintBn: "YYYY-MM-DD", hintEn: "YYYY-MM-DD" },
      { path: "schema.organization.priceRange", labelBn: "মূল্য পরিসীমা", labelEn: "Price Range", hintBn: "�েমন ৳৳", hintEn: "e.g., ৳৳" },
    ],
  },
  {
    key: "website",
    titleBn: "Website Schema (Sitelinks Search)",
    titleEn: "Website Schema (Sitelinks Search)",
    descBn: "Google সার্চবক্সে সাইটলিংকস সার্চ",
    descEn: "Sitelinks search box in Google",
    fields: [
      { path: "schema.website.enabled", labelBn: "সক্রিয়", labelEn: "Enabled", type: "boolean" },
      { path: "schema.website.searchAction", labelBn: "Search Action URL", labelEn: "Search Action URL", hintBn: "{search_term_string} ভেরিয়েবল ব্যবহার করুন", hintEn: "Use {search_term_string} placeholder" },
    ],
  },
];

export default function SeoSchemaPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const { data: seo } = useQuery({
    queryKey: ["admin", "seo"],
    queryFn: () => api.get("/admin/seo"),
  });

  const org = seo?.schema?.organization;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("স্কিমা মার্কআপ", "Schema Markup")}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("Google রিচ রেজাল্ট ও নলেজ গ্রাফের জন্য Schema.org স্ট্রাকচার্ড �েটা", "Structured data for Google rich results and Knowledge Graph")}
        </p>
      </div>

      {/* Live JSON-LD preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("JSON-LD প্রিভিউ (Organization)", "JSON-LD Preview (Organization)")}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-72 overflow-auto rounded bg-ink-50 p-3 text-xs dark:bg-ink-200 dark:text-ink-900">
{JSON.stringify({
  "@context": "https://schema.org",
  "@type": org?.type ?? "LocalBusiness",
  name: org?.name ?? "XovenMart",
  alternateName: org?.alternateName ?? "Xovent Mart",
  description: org?.description ?? "",
  url: seo?.global?.siteUrl,
  logo: org?.logoUrl || undefined,
  foundingDate: org?.foundingDate ?? "2026-01-01",
  priceRange: org?.priceRange ?? "৳�",
  address: {
    "@type": "PostalAddress",
    addressLocality: seo?.global?.addressLocality,
    addressRegion: seo?.global?.addressRegion,
    addressCountry: seo?.global?.addressCountry,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: seo?.global?.geoLat,
    longitude: seo?.global?.geoLng,
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: seo?.global?.contactPhone,
      contactType: "customer support",
      email: seo?.global?.contactEmail,
    },
  ],
}, null, 2)}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge variant={seo?.schema?.enableProductSchema ? "success" : "muted"}>
              {seo?.schema?.enableProductSchema ? "✓" : "✗"} Product
            </Badge>
            <Badge variant={seo?.schema?.enableBreadcrumbSchema ? "success" : "muted"}>
              {seo?.schema?.enableBreadcrumbSchema ? "✓" : "✗"} Breadcrumb
            </Badge>
            <Badge variant={seo?.schema?.enableFaqSchema ? "success" : "muted"}>
              {seo?.schema?.enableFaqSchema ? "✓" : "✗"} FAQ
            </Badge>
            <Badge variant={seo?.schema?.enableLocalBusinessSchema ? "success" : "muted"}>
              {seo?.schema?.enableLocalBusinessSchema ? "✓" : "✗"} LocalBusiness
            </Badge>
          </div>
        </CardContent>
      </Card>

      <SeoPage
        titleBn="স্কিমা মার্কআপ"
        titleEn="Schema Markup"
        descBn=""
        descEn=""
        sections={SECTIONS}
      />
    </div>
  );
}
