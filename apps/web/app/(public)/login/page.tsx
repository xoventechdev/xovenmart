"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, LogIn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand-lockup";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { BD_PHONE_REGEX, PHONE_ERROR_BN, PHONE_ERROR_EN, normalizeBDPhone } from "@/lib/validation";
import { useRouter, useSearchParams } from "next/navigation";

const schema = z.object({
  phone: z
    .string()
    .min(1, { message: PHONE_ERROR_EN })
    .regex(BD_PHONE_REGEX, { message: PHONE_ERROR_EN }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

export default function PublicLoginPage() {
  return (
    <Suspense fallback={null}>
      <PublicLoginPageInner />
    </Suspense>
  );
}

function PublicLoginPageInner() {
  const { lang } = useTheme();
  const delivery = useDeliveryPublicSafe();
  const general = useGeneralSettingsSafe();
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // If a user is already logged in and lands on /login (e.g. they typed
  // it manually, hit it from a stale tab, or opened a shared login link
  // after signing in elsewhere), bounce them to the home page rather
  // than showing the form. The login `onSubmit` already handles the
  // post-sign-in redirect via `?next=`; this effect covers the case
  // where they didn't submit at all.
  //
  // Skipped when `?expired=1` is set — that URL is meant for the
  // session-expiry toast below, and the user might want to re-login
  // there even if they happen to have a customer session cached.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (params.get("expired") === "1") return;
    const next = params.get("next") || "/";
    router.replace(next);
  }, [auth.isAuthenticated, router, params]);

  // Prefill the phone when the user lands here from /register after we
  // detected their number was already registered (`?phone=...`). Skip
  // prefill if a `next` is present — the URL came from somewhere else.
  const prefillPhone = useMemo(() => {
    const p = params.get("phone");
    return p ? normalizeBDPhone(p) : "";
  }, [params]);

  // Preserve a referral code through the login → register path. If the
  // visitor opened `/login?ref=ABCDEFGH` (or already has the `xm-ref`
  // cookie set by the `/r/[code]` share landing page), the
  // "First time? Create an account" link below should carry the code
  // forward so the registration form auto-fills it.
  const refForRegister = useMemo(() => {
    const fromQuery = (params.get("ref") ?? "").toUpperCase().trim();
    if (/^[A-Z0-9]{8}$/.test(fromQuery)) return fromQuery;
    if (typeof document !== "undefined") {
      const fromCookie = readCookie("xm-ref");
      if (fromCookie && /^[A-Z0-9]{8}$/.test(fromCookie.toUpperCase())) {
        return fromCookie.toUpperCase();
      }
    }
    return "";
  }, [params]);
  const registerHref = refForRegister
    ? `/register?ref=${encodeURIComponent(refForRegister)}`
    : "/register";

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { phone: prefillPhone, password: "" },
  });
  useEffect(() => {
    if (prefillPhone) {
      form.setValue("phone", prefillPhone, { shouldValidate: false });
      // Move focus to the password field so the user can just start typing.
      const t = setTimeout(() => {
        const el = document.getElementById("login-password");
        if (el) (el as HTMLInputElement).focus();
      }, 50);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPhone]);

  // Session-expiry toast — fires once when the API client bounced the
  // user here via `?expired=1` (see lib/api.ts request interceptor). Tells
  // the shopper their session ended rather than leaving them wondering
  // why they were logged out. Fires once per mount via a ref guard so a
  // tab refresh doesn't re-toast.
  const [expiredShown, setExpiredShown] = useState(false);
  useEffect(() => {
    if (expiredShown) return;
    if (params.get("expired") === "1") {
      toast(
        (lang === "bn" ? "সেশন শেষ হয়ে গেছে — আবার লগইন করুন" : "Your session has expired — please sign in again"),
        {
          description:
            lang === "bn"
              ? "নিরাপত্তার জন্য স্বয়ংক্রিয়ভাবে লগআউট করা হয়েছে।"
              : "You were signed out automatically for security.",
          duration: 5000,
        },
      );
      setExpiredShown(true);
    }
  }, [params, lang, expiredShown]);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const phoneErr = lang === "bn" ? PHONE_ERROR_BN : PHONE_ERROR_EN;

  async function onSubmit(values: z.infer<typeof schema>) {
    setLoading(true);
    try {
      const phone = normalizeBDPhone(values.phone);
      const user = await auth.login(phone, values.password);
      toast.success(t("স্বাগতম!", `Welcome back, ${user.name}!`));
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
    } catch (e) {
      if (e instanceof ApiError) {
        const code = String(e.data?.message ?? e.message ?? "").toUpperCase();
        if (code.includes("USER_NOT_FOUND")) {
          toast.error(t("এই নম্বরে কোনো অ্যাকাউন্ট নেই", "No account found with this phone"));
          const phone = encodeURIComponent(normalizeBDPhone(values.phone));
          window.location.href = `/register?phone=${phone}`;
          return;
        }
        if (code.includes("PASSWORD_NOT_SET")) {
          toast.error(
            t(
              "অ্যাকাউন্ট সেটআপ সম্পূর্ণ করুন",
              "Please complete your account setup",
            ),
          );
          const phone = encodeURIComponent(normalizeBDPhone(values.phone));
          window.location.href = `/register?phone=${phone}&setup=1`;
          return;
        }
        if (code.includes("INVALID_CREDENTIALS")) {
          toast.error(t("ফোন বা পাসওয়ার্ড ভুল", "Wrong phone or password"));
          return;
        }
      }
      toast.error(t("লগইন ব্যর্থ হয়েছে", "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-primary-50 px-4 py-12 dark:bg-ink-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 shadow-lg rounded-2xl overflow-hidden">
            <BrandLockup
              size={64}
              logoUrl={general.brand.logoUrl}
              logoDarkUrl={general.brand.logoDarkUrl}
            />
          </div>
          <CardTitle className="text-2xl">
            {t("XovenMart-এ লগইন", "Sign in to XovenMart")}
          </CardTitle>
          <p className="text-sm text-muted-foreground italic mt-1">
            {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
          </p>
          <CardDescription>
            {t("আপনার অ্যাকাউন্টে প্রবেশ করুন", "Sign in to your account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("মোবাইল নম্বর", "Phone number")}
              </label>
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="01XXXXXXXXX"
                autoComplete="username"
                {...form.register("phone")}
              />
              {form.formState.errors.phone && (
                <p className="text-xs text-danger-500">{phoneErr}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("পাসওয়ার্ড", "Password")}
              </label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPwd ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((x) => !x)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-500 hover:text-ink-900"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-danger-500">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  {t("লগইন", "Sign in")}
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm">
            <Link
              href="/forgot-password"
              className="text-primary-700 hover:underline dark:text-primary-100 block"
            >
              {t("পাসওয়ার্ড ভুলে গেছেন?", "Forgot password?")}
            </Link>
            <Link
              href={registerHref}
              className="inline-flex items-center gap-1 text-ink-700 hover:text-ink-900 dark:text-ink-50"
            >
              {t("প্রথমবার? অ্যাকাউন্ট তৈরি করুন", "First time? Create an account")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Read a cookie value by name. Returns the decoded value or empty
 * string if not set. Mirrors the helper used by the register page so
 * the login flow can forward an existing `xm-ref` cookie to the
 * register page when the visitor clicks "Create an account".
 */
function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const target = `${name}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    if (part.startsWith(target)) {
      try {
        return decodeURIComponent(part.slice(target.length));
      } catch {
        return part.slice(target.length);
      }
    }
  }
  return "";
}
