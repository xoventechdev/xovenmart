"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface AuthSettings {
  otpRateLimitPerHour: number;
  otpLengthMinutes: number;
  maxLoginAttempts: number;
  jwtAccessTtlMin: number;
  refreshTtlDays: number;
  sessionTimeoutMin: number;
  requireEmailVerification: boolean;
}

export default function AuthSettingsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin", "system", "auth-settings"],
    queryFn: () => api.get("/admin/system/auth-settings") as Promise<AuthSettings>,
  });

  const [form, setForm] = useState<AuthSettings | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: AuthSettings) =>
      api.patch("/admin/system/auth-settings", payload),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "system", "auth-settings"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  if (!form) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("অথেন্টিকেশন সেটিংস", "Authentication Settings")}
        </h1>
        <div className="h-48 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("অথেন্টিকেশন সেটিংস", "Authentication Settings")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("OTP, JWT এবং সেশন সংক্রান্ত সেটিংস", "OTP, JWT, and session-related settings")}
          </p>
        </div>
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          <Save className="h-4 w-4" />
          {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle>{t("অথ সেটিংস", "Auth Settings")}</CardTitle>
            <CardDescription>
              {t("প্রতি ঘণ্টায় OTP অনুরোধের সীমা, টোকেন মেয়াদ ইত্যাদি", "OTP rate limit per hour, token TTL, etc.")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField
              labelBn="প্রতি ঘণ্টায় OTP সীমা"
              labelEn="OTP Rate Limit Per Hour"
              value={form.otpRateLimitPerHour}
              onChange={(v) => setForm({ ...form, otpRateLimitPerHour: v })}
            />
            <NumberField
              labelBn="OTP এর মেয়াদ (মিনিট)"
              labelEn="OTP Length (minutes)"
              value={form.otpLengthMinutes}
              onChange={(v) => setForm({ ...form, otpLengthMinutes: v })}
            />
            <NumberField
              labelBn="সর্বোচ্চ লগইন প্রচেষ্টা"
              labelEn="Max Login Attempts"
              value={form.maxLoginAttempts}
              onChange={(v) => setForm({ ...form, maxLoginAttempts: v })}
            />
            <NumberField
              labelBn="JWT Access TTL (মিনিট)"
              labelEn="JWT Access TTL (minutes)"
              value={form.jwtAccessTtlMin}
              onChange={(v) => setForm({ ...form, jwtAccessTtlMin: v })}
            />
            <NumberField
              labelBn="Refresh TTL (দিন)"
              labelEn="Refresh TTL (days)"
              value={form.refreshTtlDays}
              onChange={(v) => setForm({ ...form, refreshTtlDays: v })}
            />
            <NumberField
              labelBn="সেশন টাইমআউট (মিনিট)"
              labelEn="Session Timeout (minutes)"
              value={form.sessionTimeoutMin}
              onChange={(v) => setForm({ ...form, sessionTimeoutMin: v })}
            />
          </div>

          <div className="mt-4 rounded-md border border-ink-200 p-3 dark:border-ink-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.requireEmailVerification}
                onChange={(e) => setForm({ ...form, requireEmailVerification: e.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-primary-700"
              />
              <span className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ইমেইল ভেরিফিকেশন বাধ্যতামূলক", "Require email verification")}
              </span>
            </label>
            <p className="ml-6 mt-1 text-xs text-ink-500">
              {t("নতুন ব্যবহারকারীরা অ্যাকাউন্ট সক্রিয় করার আগে ইমেইল যাচাই করবে", "New users must verify email before activating account")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NumberField({
  labelBn,
  labelEn,
  value,
  onChange,
}: {
  labelBn: string;
  labelEn: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const { lang } = useTheme();
  return (
    <div>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
        {lang === "bn" ? labelBn : labelEn}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5"
      />
    </div>
  );
}