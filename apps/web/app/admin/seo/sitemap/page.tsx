"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileCode, Bot, CheckCircle2, XCircle } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SeoPage, type SeoSection } from "../_components/seo-page";

const SECTIONS: SeoSection[] = [
  {
    key: "sitemap",
    titleBn: "সাইটম্যাপ সেটিংস",
    titleEn: "Sitemap Settings",
    descBn: "/sitemap.xml ফাইলে কী কী URL অন্তর্ভুক্ত হবে",
    descEn: "What URLs will be included in /sitemap.xml",
    fields: [
      { path: "sitemap.enabled", labelBn: "সাইটম্যাপ চালু", labelEn: "Sitemap Enabled", type: "boolean" },
      {
        path: "sitemap.changeFrequency",
        labelBn: "পরিবর্তন ফ্রিকোয়েন্সি",
        labelEn: "Default Change Frequency",
        type: "select",
        options: [
          { value: "always", label: "Always" },
          { value: "hourly", label: "Hourly" },
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
          { value: "never", label: "Never" },
        ],
      },
      { path: "sitemap.includeCategories", labelBn: "ক্যাটাগরি অন্তর্ভুক্ত", labelEn: "Include Categories", type: "boolean" },
      { path: "sitemap.includeProducts", labelBn: "পণ্য অন্তর্ভুক্ত", labelEn: "Include Products", type: "boolean" },
      { path: "sitemap.includeStaticPages", labelBn: "স্ট্যাটিক পেজ অন্তর্ভুক্ত", labelEn: "Include Static Pages", type: "boolean" },
    ],
  },
  {
    key: "robots",
    titleBn: "robots.txt সেটিংস",
    titleEn: "robots.txt Settings",
    descBn: "কোন পাথ সার্চ ই�্জিন ক্রল করতে পারবে",
    descEn: "Which paths search engines may crawl",
    fields: [
      { path: "robots.enabled", labelBn: "robots.txt চালু", labelEn: "robots.txt Enabled", type: "boolean" },
      { path: "robots.crawlDelay", labelBn: "ক্রল ডিলে (সেকেন্ড)", labelEn: "Crawl Delay (sec)", type: "number" },
      {
        path: "robots.disallowPaths",
        labelBn: "নিষিদ্ধ পাথ",
        labelEn: "Disallow Paths",
        type: "textarea",
        hintBn: "প্রতি লাইনে একটি, যেমন /admin",
        hintEn: "One per line, e.g., /admin",
      },
      {
        path: "robots.allowPaths",
        labelBn: "�নুমোদিত পাথ",
        labelEn: "Allow Paths",
        type: "textarea",
        hintBn: "প্রতি লাইনে একটি",
        hintEn: "One per line",
      },
    ],
  },
];

export default function SeoSitemapPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const { data: seo } = useQuery({
    queryKey: ["admin", "seo"],
    queryFn: () => api.get("/admin/seo"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("সাইটম্যাপ ও robots.txt", "Sitemap & Robots")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("সার্চ ইঞ্জিন আবিষ্কারের জন্য সা�টম্যাপ ও robots.txt কনফিগার করুন", "Configure sitemap and robots.txt for search engine discovery")}
        </p>
      </div>

      {/* Live preview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCode className="h-4 w-4" />
              {t("sitemap.xml", "sitemap.xml")}
              <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-normal text-primary-700 hover:underline">
                <ExternalLink className="mr-1 inline h-3 w-3" />
                {t("ওপেন", "Open")}
              </a>
            </CardTitle>
            <CardDescription>{t("জেনারেটেড আ�টপুট", "Generated output")}</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-48 overflow-auto rounded bg-ink-50 p-3 text-xs dark:bg-ink-200 dark:text-ink-900">
{`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${seo?.global?.siteUrl ?? "https://xovenmart.com"}/</loc>
    <changefreq>${seo?.sitemap?.changeFrequency ?? "daily"}</changefreq>
    <priority>1.0</priority>
  </url>
  ...
</urlset>`}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" />
              robots.txt
              <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-normal text-primary-700 hover:underline">
                <ExternalLink className="mr-1 inline h-3 w-3" />
                {t("ওপেন", "Open")}
              </a>
            </CardTitle>
            <CardDescription>{t("জেনারেটেড আউটপুট", "Generated output")}</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-48 overflow-auto rounded bg-ink-50 p-3 text-xs dark:bg-ink-200 dark:text-ink-900">
{`User-agent: *
${seo?.robots?.disallowPaths?.map((p: string) => `Disallow: ${p}`).join("\n") ?? "Disallow: /admin\nDisallow: /api"}
Sitemap: ${seo?.global?.siteUrl ?? "https://xovenmart.com"}/sitemap.xml`}
            </pre>
          </CardContent>
        </Card>
      </div>

      <SeoPage
        titleBn="সাইটম্যাপ ও robots.txt"
        titleEn="Sitemap & Robots"
        descBn=""
        descEn=""
        sections={SECTIONS}
      />
    </div>
  );
}
