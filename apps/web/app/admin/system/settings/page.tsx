"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save,
  Store,
  Globe,
  Wallet,
  Receipt,
  Truck,
  Megaphone,
  Tag,
  ShoppingCart,
  LayoutGrid,
  Phone,
  Image as ImageIcon,
  Upload as UploadIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface FieldDef {
  key: string;
  labelBn: string;
  labelEn: string;
  type: "text" | "textarea" | "number" | "select" | "boolean";
  options?: { value: string; label: string }[];
  placeholder?: string;
  /**
   * Optional helper text rendered under the label — used to tell the
   * admin the recommended dimensions / aspect / format before they
   * pick a file. Plain string, bilingual keys for `t()` parity.
   */
  hintBn?: string;
  hintEn?: string;
}

interface SettingsGroup {
  id: string;
  icon: any;
  titleBn: string;
  titleEn: string;
  descBn: string;
  descEn: string;
  fields: FieldDef[];
}

const GROUPS: SettingsGroup[] = [
  {
    id: "brand-identity",
    icon: ImageIcon,
    titleBn: "ব্র্যান্ড লোগো ও ফেভিকন",
    titleEn: "Brand Logo & Favicon",
    descBn:
      "আপনার লোগো (লাইট ও ডার্ক মোড), ব্রাউজার ফেভিকন এবং সোশ্যাল শেয়ার ইমেজ আপলোড করুন — কোনো ডেপ্লয় লাগবে না। PNG/JPG/WebP/SVG/ICO সাপোর্টেড। সর্বোচ্চ ৪ MB।",
    descEn:
      "Upload your logo (light + dark mode), browser favicon, and the Open Graph share image — no redeploy needed. PNG/JPG/WebP/SVG/ICO supported. Max 4 MB per file.",
    fields: [
      {
        key: "brand.logoUrl",
        labelBn: "লোগো URL (লাইট মোড)",
        labelEn: "Logo URL (light mode)",
        type: "text",
        placeholder: "https://api.xovenmart.com/static/brand/logo-<hash>.png",
        // Recommended: 240×72 px PNG w/ transparent background. The
        // header / footer / brand-lockup all render this at ≤36 px tall,
        // so a wide-but-short image keeps sharp on retina without
        // bloating the page. Max 4 MB.
        hintBn:
          "প্রস্তাবিত: 240×72 px, PNG (স্বচ্ছ ব্যাকগ্রাউন্ড), সর্বোচ্চ ৪ MB। ব্যবহৃত হয় header, footer ও লগইন পেজে।",
        hintEn:
          "Recommended: 240×72 px, PNG with transparent background, max 4 MB. Used in the header, footer and login pages.",
      },
      {
        key: "brand.logoDarkUrl",
        labelBn: "লোগো URL (ডার্ক মোড)",
        labelEn: "Logo URL (dark mode)",
        type: "text",
        placeholder: "https://api.xovenmart.com/static/brand/logoDark-<hash>.png",
        // Same dimensions as the light logo, but light-coloured strokes
        // on a transparent background so it pops against the dark
        // admin sidebar + dark-mode brand lockup.
        hintBn:
          "প্রস্তাবিত: 240×72 px, PNG (হালকা রঙের লোগো, স্বচ্ছ ব্যাকগ্রাউন্ড), সর্বোচ্চ ৪ MB। ডার্ক মোডে ব্যবহৃত হয়।",
        hintEn:
          "Recommended: 240×72 px, PNG (light-coloured logo on transparent background), max 4 MB. Used in dark mode.",
      },
      {
        key: "brand.faviconUrl",
        labelBn: "ফেভিকন URL",
        labelEn: "Favicon URL",
        type: "text",
        placeholder: "https://api.xovenmart.com/static/brand/favicon-<hash>.png",
        // Browsers ask for ICO at 32×32 (legacy) but accept PNG up to
        // 512×512. PNG is simpler than ICO and renders fine on every
        // modern browser. Square, simple, no small text.
        hintBn:
          "প্রস্তাবিত: 32×32 px PNG (সহজ আইকন) অথবা 512×512 px PNG (রেটিনা + Android), সর্বোচ্চ ৪ MB। ব্রাউজার ট্যাব ও বুকমার্কে দেখায়।",
        hintEn:
          "Recommended: 32×32 px PNG (simple icon) or 512×512 px PNG (retina + Android), max 4 MB. Shown in browser tabs and bookmarks.",
      },
      {
        key: "brand.ogImageUrl",
        labelBn: "Open Graph ইমেজ URL",
        labelEn: "Open Graph image URL",
        type: "text",
        placeholder: "https://api.xovenmart.com/static/brand/ogImage-<hash>.png",
        // 1200×630 is the Facebook/Twitter/LinkedIn sweet spot — most
        // social platforms crop to 1.91:1, and 1200×630 lands inside
        // that with no clipping. PNG/JPG, < 5 MB (Twitter caps at 5).
        hintBn:
          "প্রস্তাবিত: 1200×630 px PNG/JPG, সর্বোচ্চ ৫ MB। Facebook, Twitter, WhatsApp, LinkedIn-এ শেয়ার প্রিভিউতে দেখায়।",
        hintEn:
          "Recommended: 1200×630 px PNG/JPG, max 5 MB. Shown as the share preview on Facebook, Twitter, WhatsApp and LinkedIn.",
      },
    ],
  },
  {
    id: "brand",
    icon: Tag,
    titleBn: "ব্র্যান্ড ট্যাগলাইন",
    titleEn: "Brand Tagline",
    descBn:
      "লোগো / ব্র্যান্ড নামের ঠিক নিচে এবং ফুটারে দেখানো শর্ট ট্যাগলাইন (যেমন ‘যা চান, যখন চান’)।",
    descEn:
      "Short tagline shown right under the logo / brand name and in the footer (e.g. ‘যা চান, যখন চান’ / ‘Whatever you need, whenever you need it’).",
    fields: [
      {
        key: "brandTaglineBn",
        labelBn: "ট্যাগলাইন (বাংলা)",
        labelEn: "Tagline (BN)",
        type: "text",
        placeholder: "যা চান, যখন চান",
      },
      {
        key: "brandTaglineEn",
        labelBn: "ট্যাগলাইন (EN)",
        labelEn: "Tagline (EN)",
        type: "text",
        placeholder: "Whatever you need, whenever you need it",
      },
    ],
  },
  {
    id: "store",
    icon: Store,
    titleBn: "স্টোর তথ্য",
    titleEn: "Store Info",
    descBn: "আপনার স্টোরের নাম, ঠিকানা এবং যোগাযোগের তথ্য",
    descEn: "Your store name, address, and contact details",
    fields: [
      { key: "store.nameEn", labelBn: "নাম (EN)", labelEn: "Name (EN)", type: "text" },
      { key: "store.nameBn", labelBn: "নাম (BN)", labelEn: "Name (BN)", type: "text" },
      { key: "store.phone", labelBn: "ফোন", labelEn: "Phone", type: "text", placeholder: "+880..." },
      { key: "store.email", labelBn: "ইমেইল", labelEn: "Email", type: "text", placeholder: "support@..." },
      { key: "store.address", labelBn: "ঠিকানা", labelEn: "Address", type: "textarea" },
    ],
  },
  {
    id: "contact",
    icon: Phone,
    titleBn: "যোগাযোগের তথ্য",
    titleEn: "Contact Info",
    descBn:
      "About পেজে দেখানো ফোন নম্বর, ইমেইল ও ব্যবসায়িক সময়সূচী। ‘tel:’ লিংকে ক্যানোনিক্যাল E.164 নম্বর (যেমন +8801710000000) ব্যবহার করা হয়।",
    descEn:
      "Phone, email, and business hours shown on the About page. ‘tel:’ links use a canonical E.164 number (e.g. +8801710000000) so mobile dialers work.",
    fields: [
      {
        key: "contact.phoneDisplay",
        labelBn: "ফোন (প্রদর্শিত)",
        labelEn: "Phone (display)",
        type: "text",
        placeholder: "+৮৮০১৭১০০০০০০০",
      },
      {
        key: "contact.phoneTel",
        labelBn: "ফোন (tel: href)",
        labelEn: "Phone (tel: href)",
        type: "text",
        placeholder: "+8801710000000",
      },
      {
        key: "contact.emailDisplay",
        labelBn: "ইমেইল (প্রদর্শিত)",
        labelEn: "Email (display)",
        type: "text",
        placeholder: "hello@xovenmart.com",
      },
      {
        key: "contact.emailTo",
        labelBn: "ইমেইল (mailto: href)",
        labelEn: "Email (mailto: href)",
        type: "text",
        placeholder: "hello@xovenmart.com",
      },
      {
        key: "contact.hoursBn",
        labelBn: "সময়সূচী (বাংলা)",
        labelEn: "Business hours (BN)",
        type: "text",
        placeholder: "সকাল ৮টা — রাত ১০টা (প্রতিদিন)",
      },
      {
        key: "contact.hoursEn",
        labelBn: "সময়সূচী (EN)",
        labelEn: "Business hours (EN)",
        type: "text",
        placeholder: "8 AM — 10 PM (every day)",
      },
    ],
  },
  {
    id: "social",
    icon: Globe,
    titleBn: "সোশ্যাল মিডিয়া",
    titleEn: "Social Media",
    descBn: "আপনার সোশ্যাল মিডিয়া প্রোফাইলের লিংক",
    descEn: "Links to your social media profiles",
    fields: [
      { key: "social.facebook", labelBn: "ফেসবুক", labelEn: "Facebook", type: "text" },
      { key: "social.instagram", labelBn: "ইনস্টাগ্রাম", labelEn: "Instagram", type: "text" },
      { key: "social.youtube", labelBn: "ইউটিউব", labelEn: "YouTube", type: "text" },
      { key: "social.twitter", labelBn: "টুইটার", labelEn: "Twitter / X", type: "text" },
    ],
  },
  {
    id: "currency",
    icon: Wallet,
    titleBn: "কারেন্সি",
    titleEn: "Currency",
    descBn: "ডিফল্ট কারেন্সি ও ফরম্যাটিং",
    descEn: "Default currency and formatting",
    fields: [
      {
        key: "currency.code",
        labelBn: "কারেন্সি কোড",
        labelEn: "Currency Code",
        type: "select",
        options: [
          { value: "BDT", label: "BDT (৳)" },
          { value: "USD", label: "USD ($)" },
          { value: "INR", label: "INR (₹)" },
        ],
      },
      { key: "currency.symbol", labelBn: "প্রতীক", labelEn: "Symbol", type: "text", placeholder: "৳" },
    ],
  },
  {
    id: "tax",
    icon: Receipt,
    titleBn: "ট্যাক্স ও ভ্যাট",
    titleEn: "Tax & VAT",
    descBn: "ট্যাক্স এবং ভ্যাট সংক্রান্ত সেটিংস",
    descEn: "Tax and VAT settings",
    fields: [
      { key: "tax.vatPercent", labelBn: "ভ্যাট (%)", labelEn: "VAT (%)", type: "number" },
      {
        key: "tax.inclusive",
        labelBn: "প্রাইসে অন্তর্ভুক্ত?",
        labelEn: "Inclusive in price?",
        type: "select",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ],
      },
    ],
  },
  {
    id: "delivery",
    icon: Truck,
    titleBn: "ডেলিভারি প্রমিজ",
    titleEn: "Delivery Promise",
    descBn:
      "Header banner, হিরো ও অন্যান্য জায়গায় দেখানো ‘৩০ মিনিটে ডেলিভারি’ টেক্সট। লোকেশনগুলো (Mudafarganj, Laksam, Cumilla …) ‘Delivery Zones’ পেজ থেকে এডিট করুন।",
    descEn:
      "Marketing text shown in the header strip, hero, etc. The list of zone names (Mudafarganj, Laksam, Cumilla …) is edited on the Delivery Zones page.",
    fields: [
      {
        key: "deliveryPromiseMinutes",
        labelBn: "সময় (মিনিট)",
        labelEn: "Time (minutes)",
        type: "number",
        placeholder: "30",
      },
      {
        key: "deliveryPromiseLabelBn",
        labelBn: "ব্যাজ টেক্সট (বাংলা)",
        labelEn: "Badge text (BN)",
        type: "text",
        placeholder: "৩০ মিনিটে ডেলিভারি",
      },
      {
        key: "deliveryPromiseLabelEn",
        labelBn: "ব্যাজ টেক্সট (EN)",
        labelEn: "Badge text (EN)",
        type: "text",
        placeholder: "30-min delivery",
      },
    ],
  },
  {
    id: "delivery-marketing",
    icon: Megaphone,
    titleBn: "মার্কেটিং লাইন",
    titleEn: "Marketing Line",
    descBn:
      "হিরো, ফুটার ও SEO মেটায় ব্যবহৃত ফুল মার্কেটিং লাইন। ‘{zones}’ প্লেসহোল্ডারটা অ্যাক্টিভ জোনগুলোর নাম দিয়ে অটো-রিপ্লেস হবে (যেমন: ‘Mudafarganj, Laksam & Cumilla’)।",
    descEn:
      "Full marketing line shown in hero, footer, and SEO meta. The “{zones}” placeholder is auto-replaced with the active zone list (e.g. “Mudafarganj, Laksam & Cumilla”).",
    fields: [
      {
        key: "deliveryMarketingLineBn",
        labelBn: "মার্কেটিং লাইন (BN)",
        labelEn: "Marketing line (BN)",
        type: "text",
        placeholder: "{zones} এ সেইম-ডে ডেলিভারি",
      },
      {
        key: "deliveryMarketingLineEn",
        labelBn: "মার্কেটিং লাইন (EN)",
        labelEn: "Marketing line (EN)",
        type: "text",
        placeholder: "Same-day delivery across {zones}",
      },
    ],
  },
  {
    id: "home-page",
    icon: LayoutGrid,
    titleBn: "হোম পেজ লেআউট",
    titleEn: "Home Page Layout",
    descBn:
      "হোম পেজের ‘জনপ্রিয় পণ্য’ ক্যারাউজেলে কতগুলো পণ্য দেখাবে। বিক্রির উপর ভিত্তি করে সর্ট করা হয়; সর্বোচ্চ ৫০।",
    descEn:
      "How many items the ‘Popular Products’ carousel on the home page shows. Sorted by sales (most-ordered first); max 50.",
    fields: [
      {
        key: "homePage.popularCount",
        labelBn: "জনপ্রিয় পণ্য সংখ্যা",
        labelEn: "Popular products count",
        type: "number",
        placeholder: "12",
      },
    ],
  },
  {
    id: "checkout",
    icon: ShoppingCart,
    titleBn: "চেকআউট সেটিংস",
    titleEn: "Checkout Settings",
    descBn:
      "গেস্ট চেকআউট বন্ধ করলে অর্ডার করতে লগইন বাধ্যতামূলক; চালু থাকলে ফোন নম্বর দিয়েই অর্ডার দেওয়া যাবে।",
    descEn:
      "When guest checkout is off, customers must log in before placing an order. When on, they can check out with just a phone number.",
    fields: [
      {
        key: "guestCheckoutEnabled",
        labelBn: "গেস্ট চেকআউট চালু",
        labelEn: "Allow guest checkout",
        type: "boolean",
      },
    ],
  },
];

export default function SystemSettingsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: settings } = useQuery({
    queryKey: ["admin", "system", "settings"],
    queryFn: () => api.get("/admin/system/settings") as Promise<Record<string, any>>,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("সাধারণ সেটিংস", "General Settings")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t("আপনার স্টোরের সাধারণ তথ্য পরিচালনা করুন", "Manage your store's general information")}
        </p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-sm flex flex-wrap items-center gap-2">
        <span className="font-semibold text-amber-900 dark:text-amber-200">
          {t(
            "ডেলিভারি জোনের নাম (Mudafarganj, Laksam, Cumilla …) এখানে নয় —",
            "Delivery zone names (Mudafarganj, Laksam, Cumilla …) are not edited here —",
          )}
        </span>
        <Link
          href="/admin/delivery-zones"
          className="inline-flex items-center gap-1 rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {t("ডেলিভারি জোন ম্যানেজ করুন", "Manage delivery zones →")}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => {
          // Brand Identity needs upload buttons next to each URL input —
          // render it through the dedicated component.
          if (g.id === "brand-identity") {
            return (
              <BrandIdentityCard
                key={g.id}
                group={g}
                settings={settings ?? {}}
                lang={lang}
                t={t}
              />
            );
          }
          return (
            <SettingsCard
              key={g.id}
              group={g}
              settings={settings ?? {}}
              lang={lang}
              t={t}
            />
          );
        })}
      </div>
    </div>
  );
}

function SettingsCard({
  group,
  settings,
  lang,
  t,
}: {
  group: SettingsGroup;
  settings: Record<string, any>;
  lang: string;
  t: (bn: string, en: string) => string;
}) {
  const qc = useQueryClient();
  const Icon = group.icon;
  const initial: Record<string, string> = {};
  for (const f of group.fields) {
    const raw = settings[f.key];
    if (f.type === "boolean") {
      initial[f.key] = raw === true ? "true" : "false";
    } else {
      initial[f.key] = raw === undefined || raw === null ? "" : String(raw);
    }
  }
  const [form, setForm] = useState<Record<string, string>>(initial);
  useEffect(() => {
    setForm(initial);
  }, [settings]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = {};
      for (const f of group.fields) {
        const v = form[f.key];
        if (v === "" || v === undefined) continue;
        if (f.type === "number") {
          const n = Number(v);
          if (!Number.isNaN(n)) payload[f.key] = n;
        } else if (f.type === "boolean") {
          payload[f.key] = v === "true";
        } else if (f.type === "select") {
          if (f.key === "tax.inclusive") {
            payload[f.key] = v === "true";
          } else {
            payload[f.key] = v;
          }
        } else {
          payload[f.key] = v;
        }
      }
      return api.patch("/admin/system/settings", { settings: payload });
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "system", "settings"] });
      // Public-site caches — these mirror the same DB columns that the
      // user-facing site reads via /delivery/public and
      // /settings/public/general. Without this, an admin who flips a
      // setting (e.g. `guestCheckoutEnabled = true`) keeps seeing the
      // change reflected immediately on the admin pages, but a public
      // visitor landing on /checkout, /, or any marketing page would
      // still see the stale value for up to 5 minutes (the staleTime
      // of each public query). Symptom: admin enables guest checkout,
      // public site still bounces guests to /login until the cache
      // expires.
      //
      // Best-effort invalidate using `queryKey: ["delivery", "public"]`
      // and `queryKey: ["settings", "public", "general"]` prefixes —
      // TanStack Query will match every dependent variant.
      qc.invalidateQueries({ queryKey: ["delivery", "public"] });
      qc.invalidateQueries({ queryKey: ["settings", "public", "general"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <CardTitle>{lang === "bn" ? group.titleBn : group.titleEn}</CardTitle>
          <CardDescription>{lang === "bn" ? group.descBn : group.descEn}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {group.fields.map((f) => (
          <div key={f.key}>
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {lang === "bn" ? f.labelBn : f.labelEn}
            </label>
            <div className="mt-1.5">
              {f.type === "textarea" ? (
                <textarea
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
                  rows={3}
                />
              ) : f.type === "select" ? (
                <select
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "boolean" ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={form[f.key] === "true"}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, [f.key]: e.target.checked ? "true" : "false" }))
                    }
                    className="h-4 w-4 rounded border-ink-300 text-primary-700"
                  />
                  <span className="text-ink-700 dark:text-ink-900">
                    {form[f.key] === "true"
                      ? t("চালু", "Enabled")
                      : t("বন্ধ", "Disabled")}
                  </span>
                </label>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * BrandIdentityCard — variant of SettingsCard with per-field "Upload"
 * buttons that POST to `/admin/brand-assets/upload`. The upload
 * endpoint writes the file to a Coolify-mounted volume and writes the
 * resulting public URL back into the matching `brand.*Url` setting row,
 * so the admin sees the new URL appear in the input as soon as the
 * upload completes (no separate "Save" click needed for the URL
 * itself — but the rest of the form still uses the standard Save).
 *
 * Why a dedicated component instead of extending SettingsCard: the
 * upload requires a per-field `kind` ("logo" / "logoDark" / "favicon"
 * / "ogImage") and a hidden file input — too much state to thread
 * through the existing data-driven SettingsCard cleanly.
 */
function BrandIdentityCard({
  group,
  settings,
  lang,
  t,
}: {
  group: SettingsGroup;
  settings: Record<string, any>;
  lang: string;
  t: (bn: string, en: string) => string;
}) {
  const qc = useQueryClient();
  const Icon = group.icon;
  const initial: Record<string, string> = {};
  for (const f of group.fields) {
    initial[f.key] = String(settings[f.key] ?? "");
  }
  const [form, setForm] = useState<Record<string, string>>(initial);
  useEffect(() => {
    setForm(initial);
  }, [settings]);

  // Per-kind "uploading" map so multiple fields can be in-flight.
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const upload = useMutation({
    mutationFn: async ({ kind, key, file }: { kind: string; key: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      // Use raw fetch + manual auth header — the admin `api` client
      // doesn't speak multipart, and we don't want to bloat the api
      // client with that just for one route.
      //
      // Read the token through `api.getAccessToken()` instead of
      // `localStorage.getItem("xm-admin-token")` so we always send the
      // current in-memory access token (which tracks the refresh
      // rotation in `api.refreshAccessToken()`). The old
      // `xm-admin-token` key was never written — auth tokens live under
      // a single JSON blob at `xm-auth` (see lib/api.ts) — so any
      // upload that depended on it returned 401 "Missing or malformed
      // Authorization header" from the very first byte. Going through
      // the api client keeps the customer/admin audience gating
      // consistent with every other admin call too.
      const token = api.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated — please log in again.");
      }
      const res = await fetch(
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
          /\/api\/v\d+\/?$/,
          "",
        ) + "/api/v1/admin/brand-assets/upload",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Upload failed: ${res.status} ${txt}`);
      }
      return (await res.json()) as { url: string; kind: string };
    },
    onSuccess: (data, vars) => {
      // Update the local input with the new URL so the admin can see it
      // before clicking Save.
      setForm((s) => ({ ...s, [vars.key]: data.url }));
      toast.success(t("আপলোড সফল — URL যোগ হয়েছে", "Upload complete — URL pre-filled"));
      // Bust the same caches as a manual Save.
      qc.invalidateQueries({ queryKey: ["admin", "system", "settings"] });
      qc.invalidateQueries({ queryKey: ["settings", "public", "general"] });
    },
    onError: (e: any) =>
      toast.error(e?.message ?? t("আপলোড ব্যর্থ", "Upload failed")),
    onSettled: (_d, _e, vars) =>
      setUploading((s) => ({ ...s, [vars.kind]: false })),
  });

  // Map settings key → upload `kind` (server-side enum).
  const kindFor = (key: string): string => {
    if (key === "brand.logoUrl") return "logo";
    if (key === "brand.logoDarkUrl") return "logoDark";
    if (key === "brand.faviconUrl") return "favicon";
    if (key === "brand.ogImageUrl") return "ogImage";
    return "";
  };

  const handleFile = async (key: string, file: File) => {
    const kind = kindFor(key);
    if (!kind) return;
    setUploading((s) => ({ ...s, [kind]: true }));
    upload.mutate({ kind, key, file });
  };

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) {
        // Always send brand.* keys (even if empty) so an admin can
        // clear an asset by deleting its URL and clicking Save.
        if (k.startsWith("brand.")) {
          payload[k] = v || "";
        }
      }
      return api.patch("/admin/system/settings", { settings: payload });
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "system", "settings"] });
      qc.invalidateQueries({ queryKey: ["settings", "public", "general"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <CardTitle>{lang === "bn" ? group.titleBn : group.titleEn}</CardTitle>
          <CardDescription>{lang === "bn" ? group.descBn : group.descEn}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {group.fields.map((f) => {
          const kind = kindFor(f.key);
          const isUploading = !!uploading[kind];
          return (
            <div key={f.key}>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                    {lang === "bn" ? f.labelBn : f.labelEn}
                  </label>
                  <Input
                    type="text"
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, [f.key]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    className="mt-1.5"
                  />
                  {/* Recommended size / format hint for each brand asset.
                      Renders only when hintBn/hintEn is set on the field
                      definition; non-brand groups leave it blank. */}
                  {(f.hintBn || f.hintEn) && (
                    <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                      {t(f.hintBn ?? "", f.hintEn ?? "")}
                    </p>
                  )}
                </div>
                <input
                  ref={(el) => {
                    fileInputs.current[f.key] = el;
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(f.key, file);
                    // Reset so re-selecting the same file fires onChange.
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => fileInputs.current[f.key]?.click()}
                  title={t("আপলোড", "Upload")}
                >
                  <UploadIcon className="h-4 w-4" />
                  {isUploading
                    ? t("আপলোড হচ্ছে...", "Uploading…")
                    : t("আপলোড", "Upload")}
                </Button>
              </div>
              {/* Live preview — only when the input is a non-empty URL. */}
              {form[f.key] && (
                <div className="mt-2 rounded-md border border-ink-200 bg-ink-50 p-2 dark:border-ink-300 dark:bg-ink-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form[f.key]}
                    alt={lang === "bn" ? f.labelBn : f.labelEn}
                    className="max-h-24 max-w-full object-contain"
                  />
                </div>
              )}
            </div>
          );
        })}
        <div className="flex justify-end pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}