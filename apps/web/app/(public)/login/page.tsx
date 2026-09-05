"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  BD_PHONE_REGEX,
  EMAIL_REGEX,
  normalizeBDPhone,
} from "@/lib/validation";

/**
 * Identifier (phone OR email) and password are both REQUIRED.
 *
 * Login is now a single-step flow: identifier + password → tokens.
 * OTP is no longer part of the login happy path — it's reserved for
 * creating a new account and resetting a forgotten password. The
 * admin's `customerOtpRequired` toggle is intentionally ignored here.
 *
 * Shape detection (phone vs email) happens client-side for UX (we use
 * BD_PHONE_REGEX to decide whether to type=tel the input and to pick
 * the placeholder), but the server decides for real.
 */
const step1Schema = z.object({
  identifier: z
    .string()
    .min(4, { message: "Enter your phone or email" }),
  password: z
    .string()
    .min(6, { message: "Password is required (min 6 characters)" }),
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
  const [submitting, setSubmitting] = useState(false);

  // Bounce to home if a customer is already signed in (skipped when
  // ?expired=1 is set so the session-expiry toast can show).
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (params.get("expired") === "1") return;
    const next = params.get("next") || "/";
    router.replace(next);
  }, [auth.isAuthenticated, router, params]);

  // Prefill the identifier from ?phone=... — kept for the legacy path
  // where /register redirects back here on duplicate phone.
  const prefillIdentifier = useMemo(() => {
    const p = params.get("phone");
    return p ? normalizeBDPhone(p) : "";
  }, [params]);

  // Preserve a referral code through the login → register path. If the
  // visitor opened `/login?ref=ABCDEFGH` (or already has the `xm-ref`
  // cookie set by the `/r/[code]` share landing page), the "First
  // time? Create an account" link below should carry the code forward
  // so the registration form auto-fills it.
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

  const form = useForm<z.infer<typeof step1Schema>>({
    resolver: zodResolver(step1Schema),
    defaultValues: { identifier: prefillIdentifier, password: "" },
  });
  useEffect(() => {
    if (prefillIdentifier) {
      form.setValue("identifier", prefillIdentifier, { shouldValidate: false });
      const t = setTimeout(() => {
        const el = document.getElementById("login-password");
        if (el) (el as HTMLInputElement).focus();
      }, 50);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillIdentifier]);

  // Session-expiry toast (once per mount) — preserved from the previous
  // implementation.
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

  // Client-side shape detection (UX hint only). Backend decides for
  // real. If it looks like an email, use type=email; if phone-like, use
  // type=tel. Otherwise default to text.
  const identifierShape = useMemo(() => {
    const v = form.watch("identifier") ?? "";
    if (EMAIL_REGEX.test(v)) return "email" as const;
    if (/^[+\d][\d\s\-]*$/.test(v)) return "phone" as const;
    return "unknown" as const;
  }, [form]);

  /**
   * Submit — identifier + password. The backend verifies the password
   * and (on success) returns tokens directly. No OTP step.
   */
  async function onSubmit(values: z.infer<typeof step1Schema>) {
    setSubmitting(true);
    try {
      const identifier = values.identifier.trim();
      const normalized = BD_PHONE_REGEX.test(identifier)
        ? normalizeBDPhone(identifier)
        : identifier;

      const res = await auth.startLogin({
        identifier: normalized,
        password: values.password,
      });

      if (res.user) {
        toast.success(t("স্বাগতম!", `Welcome back, ${res.user.name}!`));
        const next = new URLSearchParams(window.location.search).get("next") || "/";
        window.location.href = next;
        return;
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = String(e.data?.message ?? e.message ?? "");
        const code = msg.toUpperCase();

        if (code.includes("USER_NOT_FOUND")) {
          toast.error(t("এই নম্বরে কোনো অ্যাকাউন্ট নেই", "No account found"));
          window.location.href = `/register?phone=${encodeURIComponent(values.identifier)}`;
          return;
        }
        if (code.includes("PASSWORD_NOT_SET")) {
          toast.error(
            t(
              "এই অ্যাকাউন্টে পাসওয়ার্ড সেট করা নেই — পাসওয়ার্ড রিসেট করুন",
              "This account has no password set — please reset your password",
            ),
          );
          return;
        }
        if (code.includes("INVALID_CREDENTIALS")) {
          toast.error(t("ফোন/ইমেইল বা পাসওয়ার্ড ভুল", "Wrong identifier or password"));
          return;
        }
        toast.error(msg || t("লগইন ব্যর্থ হয়েছে", "Login failed"));
      } else {
        toast.error(t("লগইন ব্যর্থ হয়েছে", "Login failed"));
      }
    } finally {
      setSubmitting(false);
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
            {t("ফোন বা ইমেইল দিয়ে প্রবেশ করুন", "Sign in with phone or email")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ফোন বা ইমেইল", "Phone or email")}
              </label>
              <Input
                type={identifierShape === "email" ? "email" : identifierShape === "phone" ? "tel" : "text"}
                inputMode={identifierShape === "phone" ? "numeric" : "text"}
                placeholder="01XXXXXXXXX or you@example.com"
                autoComplete="username"
                {...form.register("identifier")}
              />
              {form.formState.errors.identifier && (
                <p className="text-xs text-danger-500">
                  {form.formState.errors.identifier.message}
                </p>
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
                <p className="text-xs text-danger-500">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={submitting} className="w-full" size="lg">
              {submitting ? (
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
 * Read a cookie value by name. Mirrors the helper used by the register
 * page so the login flow can forward an existing `xm-ref` cookie.
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
