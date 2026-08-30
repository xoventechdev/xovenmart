"use client";

import { SeoPage, type SeoSection } from "../_components/seo-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const SECTIONS: SeoSection[] = [
  {
    key: "social",
    titleBn: "Open Graph ও Twitter Card",
    titleEn: "Open Graph & Twitter Card",
    descBn: "Facebook, Twitter, WhatsApp-এ শেয়ার করার সময় যা দেখাবে",
    descEn: "What shows when shared on Facebook, Twitter, WhatsApp",
    fields: [
      { path: "social.ogSiteName", labelBn: "OG সাইট নাম", labelEn: "OG Site Name" },
      {
        path: "social.ogLocale",
        labelBn: "OG Locale (প্রাইমারি)",
        labelEn: "OG Locale (Primary)",
        hintBn: "যেমন: bn_BD, en_US",
        hintEn: "e.g., bn_BD, en_US",
      },
      { path: "social.ogLocaleAlternate", labelBn: "OG Locale (বিকল্প)", labelEn: "OG Locale (Alternate)" },
      {
        path: "social.twitterCard",
        labelBn: "Twitter Card Type",
        labelEn: "Twitter Card Type",
        type: "select",
        options: [
          { value: "summary", label: "Summary" },
          { value: "summary_large_image", label: "Summary with Large Image" },
          { value: "app", label: "App" },
          { value: "player", label: "Player" },
        ],
      },
      { path: "social.twitterSite", labelBn: "Twitter Site Handle", labelEn: "Twitter Site Handle" },
      { path: "social.facebookAppId", labelBn: "Facebook App ID", labelEn: "Facebook App ID" },
      { path: "social.defaultOgImageUrl", labelBn: "ডিফল্ট OG ছবি", labelEn: "Default OG Image", type: "url" },
      { path: "social.defaultOgImageAlt", labelBn: "OG ছবি Alt", labelEn: "OG Image Alt Text" },
    ],
  },
];

export default function SeoSocialPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const { data: seo } = useQuery({
    queryKey: ["admin", "seo"],
    queryFn: () => api.get("/admin/seo"),
  });

  const [testUrl, setTestUrl] = useState("");
  const ogImage = seo?.social?.defaultOgImageUrl || seo?.global?.defaultOgImageUrl;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("সোশ্যাল শেয়ার SEO", "Social Sharing (OG)")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("Facebook, Twitter, WhatsApp, LinkedIn-এ শেয়ার করার সময় যে কার্ড দেখাবে", "Card preview when shared on social platforms")}
        </p>
      </div>

      {/* Live OG card preview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Facebook / WhatsApp প্রিভিউ", "Facebook / WhatsApp Preview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-ink-200 dark:border-ink-300">
              <div className="aspect-[1.91/1] w-full bg-ink-100 dark:bg-ink-200">
                {ogImage ? (
                  <img src={ogImage} alt="OG" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-ink-500">
                    {t("ডিফল্ট OG �বি সেট করা হয়নি", "No default OG image set")}
                  </div>
                )}
              </div>
              <div className="bg-ink-50 p-3 dark:bg-ink-100">
                <div className="text-xs uppercase text-ink-500">
                  {seo?.global?.siteUrl?.replace(/^https?:\/\//, "") ?? "xovenmart.com"}
                </div>
                <div className="mt-0.5 font-semibold text-ink-900 dark:text-ink-900">
                  {seo?.homepage?.titleEn ?? "XovenMart"}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                  {seo?.homepage?.descriptionEn ?? ""}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("টেস্ট টুল", "Test Tools")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("একটি URL দিয়ে টেস্� করুন", "Test with a URL")}</label>
              <Input
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://xovenmart.com/about"
              />
            </div>
            <div className="space-y-2 text-sm">
              <a
                href={`https://www.opengraph.xyz/?url=${encodeURIComponent(testUrl || "https://xovenmart.com")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md bg-info-100 p-2 text-info-700 hover:bg-info-500/30 dark:bg-info-500/20"
              >
                {t("🔍 OpenGraph.xyz দিয়ে টেস্ট", "🔍 Test with OpenGraph.xyz")} ↗
              </a>
              <a
                href={`https://cards-dev.twitter.com/validator?url=${encodeURIComponent(testUrl || "https://xovenmart.com")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md bg-info-100 p-2 text-info-700 hover:bg-info-500/30 dark:bg-info-500/20"
              >
                {t("🐦 Twitter Card Validator", "🐦 Twitter Card Validator")} ↗
              </a>
              <a
                href={`https://www.facebook.com/sharing/debug/?q=${encodeURIComponent(testUrl || "https://xovenmart.com")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md bg-info-100 p-2 text-info-700 hover:bg-info-500/30 dark:bg-info-500/20"
              >
                {t("📘 Facebook Sharing Debugger", "📘 Facebook Sharing Debugger")} ↗
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      <SeoPage
        titleBn="সোশ্যাল শেয়ার SEO"
        titleEn="Social Sharing SEO"
        descBn=""
        descEn=""
        sections={SECTIONS}
        scope="social"
      />
    </div>
  );
}
