"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Store, Globe, Wallet, Receipt, Truck, Megaphone, Tag, ShoppingCart, LayoutGrid, Phone } from "lucide-react";
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
        {GROUPS.map((g) => (
          <SettingsCard
            key={g.id}
            group={g}
            settings={settings ?? {}}
            lang={lang}
            t={t}
          />
        ))}
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