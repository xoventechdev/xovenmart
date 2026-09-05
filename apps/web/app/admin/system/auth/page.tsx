"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, ShieldCheck, Mail, MessageSquare, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

type OtpChannel = "EMAIL" | "SMS" | "BOTH";

interface AuthSettings {
  otpRateLimitPerHour: number;
  otpLengthMinutes: number;
  maxLoginAttempts: number;
  jwtAccessTtlMin: number;
  refreshTtlDays: number;
  sessionTimeoutMin: number;
  requireEmailVerification: boolean;
  // Customer login / registration
  customerOtpRequired: boolean;
  customerOtpChannel: OtpChannel;
  customerOtpLength: number;
  customerOtpTtlMinutes: number;
  customerOtpMaxAttempts: number;
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
            <CardTitle>{t("লিগ্যাসি / টোকেন সেটিংস", "Legacy / Token Settings")}</CardTitle>
            <CardDescription>
              {t(
                "পুরনো ফোন-OTP ফ্লো এবং JWT/সেশন টোকেন সংক্রান্ত সেটিংস। কাস্টমার লগইনের OTP সেটিংস নিচের কার্ডে।",
                "Legacy phone-OTP flow + JWT/session token settings. Customer login OTP settings are in the card below.",
              )}
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
              labelBn="লিগ্যাসি OTP এর মেয়াদ (মিনিট)"
              labelEn="Legacy OTP TTL (minutes)"
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

      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <Users className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <CardTitle>{t("কাস্টমার লগইন ও রেজিস্ট্রেশন", "Customer Login & Registration")}</CardTitle>
            <CardDescription>
              {t(
                "নতুন কাস্টমারদের অ্যাকাউন্ট খোলার প্রবাহ নিয়ন্ত্রণ করুন",
                "Control how new customers create accounts",
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OTP on/off toggle */}
          <div className="rounded-md border border-ink-200 p-3 dark:border-ink-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.customerOtpRequired}
                onChange={(e) =>
                  setForm({ ...form, customerOtpRequired: e.target.checked })
                }
                className="h-4 w-4 rounded border-ink-300 text-primary-700"
              />
              <span className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("OTP যাচাইকরণ বাধ্যতামূলক", "Require OTP verification")}
              </span>
            </label>
            <p className="ml-6 mt-1 text-xs text-ink-500">
              {t(
                "বন্ধ থাকলে ব্যবহারকারী সরাসরি অ্যাকাউন্ট তৈরি করে লগইন হবে (পাসওয়ার্ড প্রয়োজন)।",
                "Off = customers create an account instantly with just a password.",
              )}
            </p>
          </div>

          {/* OTP channel selector — only meaningful when OTP is on */}
          <div
            className={`rounded-md border border-ink-200 p-3 dark:border-ink-300 ${
              !form.customerOtpRequired ? "opacity-50" : ""
            }`}
          >
            <div className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("OTP যেখানে পাঠানো হবে", "OTP delivery channel")}
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {t(
                "ইমেইল খরচ কম; SMS দ্রুত তবে প্রতি বার্তা খরচ যোগ হয়। BOTH সবচেয়ে নির্ভরযোগ্য।",
                "Email is cheapest. SMS is fastest but billed per message. BOTH is most reliable.",
              )}
            </p>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <ChannelOption
                icon={<Mail className="h-4 w-4" />}
                active={form.customerOtpChannel === "EMAIL"}
                disabled={!form.customerOtpRequired}
                title={t("শুধু ইমেইল", "Email only")}
                subtitle={t("সবচেয়ে কম খরচ", "Lowest cost")}
                onClick={() => setForm({ ...form, customerOtpChannel: "EMAIL" })}
              />
              <ChannelOption
                icon={<MessageSquare className="h-4 w-4" />}
                active={form.customerOtpChannel === "SMS"}
                disabled={!form.customerOtpRequired}
                title={t("শুধু SMS", "SMS only")}
                subtitle={t("দ্রুত তবে খরচযুক্ত", "Fast but billed")}
                onClick={() => setForm({ ...form, customerOtpChannel: "SMS" })}
              />
              <ChannelOption
                icon={
                  <span className="flex gap-1">
                    <Mail className="h-4 w-4" />
                    <MessageSquare className="h-4 w-4" />
                  </span>
                }
                active={form.customerOtpChannel === "BOTH"}
                disabled={!form.customerOtpRequired}
                title={t("ইমেইল + SMS", "Email + SMS")}
                subtitle={t("সবচেয়ে নির্ভরযোগ্য", "Most reliable")}
                onClick={() => setForm({ ...form, customerOtpChannel: "BOTH" })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <NumberField
              labelBn="OTP দৈর্ঘ্য (অঙ্ক)"
              labelEn="OTP length (digits)"
              value={form.customerOtpLength}
              min={4}
              max={8}
              onChange={(v) => setForm({ ...form, customerOtpLength: v })}
              disabled={!form.customerOtpRequired}
            />
            <NumberField
              labelBn="OTP মেয়াদ (মিনিট)"
              labelEn="OTP TTL (minutes)"
              value={form.customerOtpTtlMinutes}
              min={1}
              max={60}
              onChange={(v) => setForm({ ...form, customerOtpTtlMinutes: v })}
              disabled={!form.customerOtpRequired}
            />
            <NumberField
              labelBn="সর্বোচ্চ প্রচেষ্টা"
              labelEn="Max OTP attempts"
              value={form.customerOtpMaxAttempts}
              min={1}
              max={10}
              onChange={(v) => setForm({ ...form, customerOtpMaxAttempts: v })}
              disabled={!form.customerOtpRequired}
            />
          </div>

          <p className="text-xs text-ink-500">
            {t(
              "ইমেইল OTP ব্যবহার করতে SMTP সেটিংসে 'AUTH' উদ্দেশ্যের জন্য একটি প্রোভাইডার কনফিগার করুন।",
              "To deliver email OTPs, configure an SMTP provider for the 'AUTH' purpose in SMTP Settings.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelOption({
  icon,
  title,
  subtitle,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-start gap-2 rounded-md border p-3 text-left transition-colors ${
        active
          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/30"
          : "border-ink-200 hover:border-ink-300 dark:border-ink-300"
      } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div
        className={`mt-0.5 ${
          active ? "text-primary-700 dark:text-primary-200" : "text-ink-500"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-ink-700 dark:text-ink-900">{title}</div>
        <div className="mt-0.5 text-xs text-ink-500">{subtitle}</div>
      </div>
    </button>
  );
}

function NumberField({
  labelBn,
  labelEn,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  labelBn: string;
  labelEn: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
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
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value === "" ? 0 : Number(e.target.value);
          let clamped = raw;
          if (typeof min === "number") clamped = Math.max(min, clamped);
          if (typeof max === "number") clamped = Math.min(max, clamped);
          onChange(clamped);
        }}
        className="mt-1.5"
      />
    </div>
  );
}
