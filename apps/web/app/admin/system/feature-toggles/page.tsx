"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Toggle {
  key: keyof Toggles;
  labelBn: string;
  labelEn: string;
  descBn: string;
  descEn: string;
}

interface Toggles {
  enableCOD: boolean;
  enableBkash: boolean;
  enableNagad: boolean;
  enableReferrals: boolean;
  enableLoyalty: boolean;
  enablePushNotifications: boolean;
  registrationOpen: boolean;
}

const TOGGLES: Toggle[] = [
  {
    key: "enableCOD",
    labelBn: "ক্যাশ অন ডেলিভারি",
    labelEn: "Cash on Delivery",
    descBn: "গ্রাহকরা পণ্য পেয়ে টাকা প্রদান করতে পারবে",
    descEn: "Customers can pay cash when receiving their order",
  },
  {
    key: "enableBkash",
    labelBn: "বিকাশ পেমেন্ট",
    labelEn: "bKash Payment",
    descBn: "বিকাশের মাধ্যমে পেমেন্ট গ্রহণ সক্রিয় করুন",
    descEn: "Enable accepting payments via bKash",
  },
  {
    key: "enableNagad",
    labelBn: "নগদ পেমেন্ট",
    labelEn: "Nagad Payment",
    descBn: "নগদের মাধ্যমে পেমেন্ট গ্রহণ সক্রিয় করুন",
    descEn: "Enable accepting payments via Nagad",
  },
  {
    key: "enableReferrals",
    labelBn: "রেফারেল প্রোগ্রাম",
    labelEn: "Referral Program",
    descBn: "ব্যবহারকারীরা অন্যদের রেফার করে পুরস্কার পেতে পারবে",
    descEn: "Users can refer others and earn rewards",
  },
  {
    key: "enableLoyalty",
    labelBn: "লয়্যালটি প্রোগ্রাম",
    labelEn: "Loyalty Program",
    descBn: "বারবার কেনাকাটায় পয়েন্ট অর্জন",
    descEn: "Earn points on repeat purchases",
  },
  {
    key: "enablePushNotifications",
    labelBn: "পুশ নোটিফিকেশন",
    labelEn: "Push Notifications",
    descBn: "অর্ডার আপডেটের জন্য পুশ বিজ্ঞপ্তি পাঠান",
    descEn: "Send push notifications for order updates",
  },
  // Maintenance Mode used to live here. It is now *only* editable from
  // System → Maintenance (/admin/system/maintenance) so there's a
  // single source of truth. Showing it here would re-introduce the
  // two-switch confusion (banner-only vs. full lock).
  {
    key: "registrationOpen",
    labelBn: "রেজিস্ট্রেশন চালু",
    labelEn: "Registration Open",
    descBn: "নতুন ব্যবহারকারীরা অ্যাকাউন্ট তৈরি করতে পারবে",
    descEn: "Allow new users to create accounts",
  },
];

export default function FeatureTogglesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin", "system", "feature-toggles"],
    queryFn: () => api.get("/admin/system/feature-toggles") as Promise<Toggles>,
  });

  const [form, setForm] = useState<Toggles | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (toggles: Toggles) =>
      api.patch("/admin/system/feature-toggles", toggles),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "system", "feature-toggles"] });
      // Also invalidate the public-facing cache so any logged-out
      // browser session refetches the new state on its next page paint.
      qc.invalidateQueries({ queryKey: ["feature-toggles", "public"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  if (!form) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("ফিচার টগল", "Feature Toggles")}
        </h1>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("ফিচার টগল", "Feature Toggles")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("সিস্টেমের ফিচার চালু বা বন্ধ করুন", "Enable or disable system features")}
          </p>
        </div>
        <Button
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
        >
          <Save className="h-4 w-4" />
          {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সব সংরক্ষণ", "Save All")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("সব ফিচার", "All Features")}</CardTitle>
          <CardDescription>
            {t("প্রতিটি ফিচার আলাদাভাবে চালু বা বন্ধ করুন", "Toggle each feature individually")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {TOGGLES.map((tog) => (
            <ToggleRow
              key={tog.key}
              tog={tog}
              lang={lang}
              value={!!form[tog.key]}
              onChange={(v) => setForm((s) => (s ? { ...s, [tog.key]: v } : s))}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  tog,
  lang,
  value,
  onChange,
}: {
  tog: Toggle;
  lang: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-ink-200 p-3 dark:border-ink-300">
      <div className="flex-1 pr-4">
        <div className="font-medium text-ink-900 dark:text-ink-900">
          {lang === "bn" ? tog.labelBn : tog.labelEn}
        </div>
        <div className="mt-1 text-xs text-ink-500">
          {lang === "bn" ? tog.descBn : tog.descEn}
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-ink-300 text-primary-700"
        />
        <span className="flex items-center text-sm text-ink-700 dark:text-ink-900">
          {value ? <ToggleRight className="h-4 w-4 text-success-700" /> : <ToggleLeft className="h-4 w-4 text-ink-400" />}
        </span>
      </label>
    </div>
  );
}