"use client";

import { SeoPage, type SeoSection } from "../_components/seo-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/lib/theme";
import { ExternalLink, BarChart3, ShieldCheck } from "lucide-react";

const SECTIONS: SeoSection[] = [
  {
    key: "analytics",
    titleBn: "অ্যানালিটিক্স ও মনিটরিং",
    titleEn: "Analytics & Monitoring",
    descBn: "ট্রাফিক ও পারফরম্যান্স ট্র্যাকিং",
    descEn: "Traffic and performance tracking",
    fields: [
      { path: "analytics.googleAnalyticsId", labelBn: "Google Analytics ID", labelEn: "Google Analytics ID", hintBn: "G-XXXXXXX ফরম্যাট", hintEn: "G-XXXXXXX format" },
      { path: "analytics.googleTagManagerId", labelBn: "Google Tag Manager ID", labelEn: "GTM Container ID", hintBn: "GTM-XXXXXXX ফরম্যাট", hintEn: "GTM-XXXXXXX format" },
      { path: "analytics.enabledUmami", labelBn: "Umami চালু", labelEn: "Enable Umami", type: "boolean" },
      { path: "analytics.umamiWebsiteId", labelBn: "Umami Website ID", labelEn: "Umami Website ID" },
      { path: "analytics.facebookPixelId", labelBn: "Facebook Pixel ID", labelEn: "Facebook Pixel ID" },
      { path: "analytics.enableSentry", labelBn: "Sentry Error Tracking", labelEn: "Sentry Error Tracking", type: "boolean" },
      { path: "analytics.sentryDsn", labelBn: "Sentry DSN", labelEn: "Sentry DSN" },
    ],
  },
  {
    key: "verification",
    titleBn: "সার্চ ই�্জিন ভেরিফিকেশন",
    titleEn: "Search Engine Verification",
    descBn: "Google Search Console ও Bing Webmaster-এ মালিকানা যাচাই",
    descEn: "Verify ownership with Google Search Console & Bing Webmaster",
    fields: [
      {
        path: "analytics.googleSearchConsoleVerification",
        labelBn: "Google Search Console Verification",
        labelEn: "Google Search Console Verification",
        hintBn: "meta tag content value",
        hintEn: "meta tag content value",
      },
      {
        path: "analytics.bingWebmasterVerification",
        labelBn: "Bing Webmaster Verification",
        labelEn: "Bing Webmaster Verification",
      },
    ],
  },
  {
    key: "searchEngines",
    titleBn: "সার্চ ইঞ্জিন সাবমিশন",
    titleEn: "Search Engine Submission",
    descBn: "স্বয়ংক্রিয়ভাবে সাবমিট সেটিংস (তথ্যমূলক)",
    descEn: "Auto-submission settings (informational)",
    fields: [
      { path: "searchEngines.submitToGoogle", labelBn: "Google-এ সাবমিট", labelEn: "Submit to Google", type: "boolean" },
      { path: "searchEngines.submitToBing", labelBn: "Bing-এ সাবমিট", labelEn: "Submit to Bing", type: "boolean" },
      { path: "searchEngines.googleNewsEnabled", labelBn: "Google News সক্রিয়", labelEn: "Google News Enabled", type: "boolean" },
    ],
  },
];

export default function SeoAnalyticsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("অ্যানালিটিক্স ও ভেরিফিকেশন", "Analytics & Verification")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("ট্র্যাকিং ও সার্চ ইঞ্জিন ভেরিফিকেশন", "Tracking & search engine verification")}
        </p>
      </div>

      {/* Quick links to platforms */}
      <div className="grid gap-3 md:grid-cols-3">
        <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="group">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <BarChart3 className="h-8 w-8 text-primary-700" />
              <div className="flex-1">
                <div className="font-semibold text-ink-900 dark:text-ink-900">{t("Google Search Console", "Google Search Console")}</div>
                <div className="text-xs text-ink-500">{t("পারফরম্যান্� ও ইনডেক্সিং", "Performance & indexing")}</div>
              </div>
              <ExternalLink className="h-4 w-4 text-ink-400 group-hover:text-primary-700" />
            </CardContent>
          </Card>
        </a>
        <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer" className="group">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <BarChart3 className="h-8 w-8 text-accent-500" />
              <div className="flex-1">
                <div className="font-semibold text-ink-900 dark:text-ink-900">{t("Google Analytics", "Google Analytics")}</div>
                <div className="text-xs text-ink-500">{t("ট্রাফিক বিশ্লেষণ", "Traffic analytics")}</div>
              </div>
              <ExternalLink className="h-4 w-4 text-ink-400 group-hover:text-primary-700" />
            </CardContent>
          </Card>
        </a>
        <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="group">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <ShieldCheck className="h-8 w-8 text-info-700" />
              <div className="flex-1">
                <div className="font-semibold text-ink-900 dark:text-ink-900">{t("Bing Webmaster", "Bing Webmaster")}</div>
                <div className="text-xs text-ink-500">{t("Bing/Yahoo ইনডেক্সিং", "Bing/Yahoo indexing")}</div>
              </div>
              <ExternalLink className="h-4 w-4 text-ink-400 group-hover:text-primary-700" />
            </CardContent>
          </Card>
        </a>
      </div>

      <SeoPage
        titleBn="অ্যানালিটিক্� ও ভেরিফিকেশন"
        titleEn="Analytics & Verification"
        descBn=""
        descEn=""
        sections={SECTIONS}
      />
    </div>
  );
}
