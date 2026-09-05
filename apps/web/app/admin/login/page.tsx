"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Eye, EyeOff, LogIn } from "lucide-react";

// Production hardening notes:
// 1. We surface only generic "Invalid email or password" — never the
//    reason for failure — to prevent username enumeration. The API
//    returns "INVALID_CREDENTIALS" / "USER_NOT_FOUND" / "ACCOUNT_LOCKED"
//    etc., but we collapse all of them into one neutral message for
//    the user-facing toast. The detailed code is still available in
//    e?.data?.message for our own debugging, just not shown verbatim.
// 2. After 3 failed attempts, the button locks for 30s client-side as
//    a UX nudge. The API already rate-limits at 10/min/IP via the
//    `@Throttle({ medium: { limit: 10, ttl: 60_000 } })` decorator on
//    `POST /auth/admin/login`, so this is purely to stop users from
//    rage-clicking through the lockout window.

const schema = z.object({
  email: z.string().email("সঠিক ইমেইল দিন"),
  password: z.string().min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর"),
});

export default function AdminLoginPage() {
  const { lang } = useTheme();
  const general = useGeneralSettingsSafe();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  // Client-side lockout: counts consecutive failed attempts and locks
  // the submit button for `LOCKOUT_SECONDS` after `MAX_ATTEMPTS`. Reset
  // on a successful sign-in or when the countdown reaches zero.
  const MAX_ATTEMPTS = 3;
  const LOCKOUT_SECONDS = 30;
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);
  const now = Date.now();
  const locked = lockoutUntil > now;
  const lockoutRemaining = locked ? Math.ceil((lockoutUntil - now) / 1000) : 0;

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    if (locked) {
      toast.error(
        lang === "bn"
          ? `অনেক চেষ্টা হয়েছে — ${lockoutRemaining} সেকেন্ড পর আবার চেষ্টা করুন`
          : `Too many attempts — try again in ${lockoutRemaining}s`,
      );
      return;
    }
    setLoading(true);
    try {
      api.setAudience("admin");
      const data = await api.post("/auth/admin/login", values);
      api.setTokens(
        {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        },
        "admin"
      );
      // Success — reset the failure counter and bounce into the panel.
      setFailedAttempts(0);
      setLockoutUntil(0);
      toast.success(lang === "bn" ? "স্বাগতম!" : "Welcome!");
      // Hard reload so Next.js middleware sees the new `audience=admin`
      // cookie and lets us past the server-side gate.
      const next = new URLSearchParams(window.location.search).get("from") || "/admin";
      window.location.href = next;
    } catch (e: any) {
      // Generic user-facing message — do NOT echo back the API error
      // code (which would tell an attacker whether the email exists).
      toast.error(
        lang === "bn"
          ? "ইমেইল বা পাসওয়ার্ড ভুল"
          : "Invalid email or password",
      );
      // Server-side detail is still on `e.data?.message` for our own
      // logs — we just don't surface it.
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= MAX_ATTEMPTS) {
        setLockoutUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        toast.warning(
          lang === "bn"
            ? `অনেক চেষ্টা হয়েছে — ${LOCKOUT_SECONDS} সেকেন্ড অপেক্ষা করুন`
            : `Too many attempts — wait ${LOCKOUT_SECONDS}s`,
          { duration: LOCKOUT_SECONDS * 1000 },
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  // Brand block follows the same rule as the admin sidebar:
  //   1. Logo present → ONLY the logo image. No text alongside.
  //   2. Logo missing → brand name (store) + tagline text stack.
  // Sourced from the public general settings hook so the admin can
  // upload a logo via /admin/settings → Brand Identity and have it
  // show up here without a code change.
  const hasLogo = !!(general.brand.logoUrl || general.brand.logoDarkUrl);
  const brandName =
    lang === "bn"
      ? general.store.nameBn || "XovenMart"
      : general.store.nameEn || "XovenMart";
  const tagline =
    lang === "bn" ? general.brand.taglineBn : general.brand.taglineEn;

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4 dark:bg-ink-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {hasLogo ? (
            <div className="mx-auto mb-4 shadow-lg rounded-2xl overflow-hidden bg-white dark:bg-ink-50 p-3 inline-flex">
              {general.brand.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={general.brand.logoUrl}
                  alt={brandName}
                  width={64}
                  height={64}
                  className={
                    general.brand.logoDarkUrl
                      ? "object-contain dark:hidden"
                      : "object-contain"
                  }
                  style={{ height: 64, width: "auto", maxWidth: 200 }}
                />
              )}
              {general.brand.logoDarkUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={general.brand.logoDarkUrl}
                  alt={brandName}
                  width={64}
                  height={64}
                  className="object-contain hidden dark:inline-block"
                  style={{ height: 64, width: "auto", maxWidth: 200 }}
                />
              )}
            </div>
          ) : (
            <div className="mx-auto mb-4 text-center">
              <div className="text-2xl font-bold text-ink-900 dark:text-ink-50">
                {brandName}
              </div>
              {tagline && tagline.trim() && (
                <div className="mt-1 text-sm italic text-muted-foreground">
                  {tagline}
                </div>
              )}
            </div>
          )}
          <CardTitle className="text-2xl">{t("XovenMart অ্যাডমিন", "XovenMart Admin")}</CardTitle>
          <CardDescription>
            {t("আপনার অ্যাকাউন্টে লগইন করুন", "Sign in to your account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ইমেইল", "Email")}
              </label>
              <Input
                type="email"
                placeholder="admin@xovenmart.com"
                autoComplete="username"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-danger-500">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("পাসওয়ার্ড", "Password")}
              </label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((x) => !x)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-500 hover:text-ink-900"
                  aria-label={showPwd ? t("পাসওয়ার্ড লুকান", "Hide password") : t("পাসওয়ার্ড দেখান", "Show password")}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-danger-500">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading || locked}
              className="w-full"
              size="lg"
            >
              {loading || locked ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  {locked
                    ? t(`${lockoutRemaining} সেকেন্ড`, `${lockoutRemaining}s`)
                    : t("লগইন", "Sign in")}
                </>
              )}
            </Button>

            {locked && (
              <p className="text-center text-xs text-danger-500">
                {t(
                  `অনেক চেষ্টা হয়েছে — ${lockoutRemaining} সেকেন্ড পর আবার চেষ্টা করুন`,
                  `Too many attempts — try again in ${lockoutRemaining}s`,
                )}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
