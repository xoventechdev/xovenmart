"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowRight, Eye, EyeOff, LogIn, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand-lockup";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { useAuth, LoginOptions } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  BD_PHONE_REGEX,
  EMAIL_REGEX,
  normalizeBDPhone,
} from "@/lib/validation";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Identifier (phone OR email) is required; password is OPTIONAL.
 *
 * Password is collected only when the user explicitly opts in via the
 * "Sign in with password" toggle — this keeps the form compact for the
 * common OTP-only flow while still supporting returning users who
 * prefer passwords.
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
    .optional(),
});

const otpSchema = (length: number) =>
  z.object({
    code: z
      .string()
      .length(length, { message: `OTP must be ${length} digits` })
      .regex(new RegExp(`^\\d{${length}}$`), { message: `OTP must be ${length} digits` }),
  });

type Step = 1 | 2;

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
  const [step, setStep] = useState<Step>(1);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Pull admin-configured login options on mount. We need otpRequired +
  // otpLength to decide whether to show the OTP step + size its zod
  // validation. Defaults mirror the backend so the page still works if
  // the request fails.
  const [options, setOptions] = useState<LoginOptions>({
    otpRequired: true,
    otpChannel: "EMAIL",
    otpLength: 6,
    otpTtlMinutes: 10,
    otpMaxAttempts: 5,
  });
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    auth
      .getLoginOptions()
      .then((o) => {
        if (cancelled) return;
        setOptions(o);
        setOptionsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setOptionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Step-2 OTP form (built dynamically so the zod length matches the
  // server-configured otpLength).
  const otpZodSchema = useMemo(() => otpSchema(options.otpLength), [options.otpLength]);
  const otpForm = useForm<z.infer<ReturnType<typeof otpSchema>>>({
    resolver: zodResolver(otpZodSchema),
    defaultValues: { code: "" },
  });

  // Server returns these so the FE can echo "check your email" / "check
  // your phone" + the masked target.
  const [verificationChannel, setVerificationChannel] = useState<"EMAIL" | "SMS" | null>(null);
  const [maskedTarget, setMaskedTarget] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

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
   * Submit step 1 — identifier + optional password. The backend
   * branches on:
   *   - if password provided + correct → tokens, done.
   *   - if OTP enabled + identifier known → send OTP, return
   *     nextStep: "verify" with maskedTarget + verificationChannel.
   *   - if no password + OTP off → backend would 400 (the FE doesn't
   *     let the user submit empty when OTP is off; see below).
   */
  async function onStep1Submit(values: z.infer<typeof step1Schema>) {
    setSubmitting(true);
    try {
      const identifier = values.identifier.trim();
      // Phone-shaped inputs get normalized so the masked-target echo
      // matches what the user typed.
      const normalized = BD_PHONE_REGEX.test(identifier)
        ? normalizeBDPhone(identifier)
        : identifier;

      const res = await auth.startLogin({
        identifier: normalized,
        password: values.password || undefined,
      });

      if (res.nextStep === "complete" && res.user) {
        toast.success(t("স্বাগতম!", `Welcome back, ${res.user.name}!`));
        const next = new URLSearchParams(window.location.search).get("next") || "/";
        window.location.href = next;
        return;
      }

      if (res.nextStep === "verify") {
        setVerificationChannel(res.verificationChannel ?? null);
        setMaskedTarget(res.maskedTarget ?? normalized);
        setDevCode(res.devCode ?? null);
        setResendCooldown(30);
        setStep(2);
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
              "এই অ্যাকাউন্টে পাসওয়ার্ড নেই — OTP দিয়ে চেষ্টা করুন",
              "This account has no password — sign in with OTP",
            ),
          );
          // Re-submit without the password so the user lands on step 2.
          try {
            const normalized = BD_PHONE_REGEX.test(values.identifier)
              ? normalizeBDPhone(values.identifier)
              : values.identifier;
            const res = await auth.startLogin({ identifier: normalized });
            if (res.nextStep === "verify") {
              setVerificationChannel(res.verificationChannel ?? null);
              setMaskedTarget(res.maskedTarget ?? normalized);
              setDevCode(res.devCode ?? null);
              setResendCooldown(30);
              setStep(2);
              return;
            }
          } catch {
            // fall through to the generic error below
          }
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

  async function onOtpSubmit(values: z.infer<ReturnType<typeof otpSchema>>) {
    const identifier = form.getValues("identifier");
    const normalized = BD_PHONE_REGEX.test(identifier)
      ? normalizeBDPhone(identifier)
      : identifier;
    setSubmitting(true);
    try {
      await auth.verifyLogin(normalized, values.code);
      toast.success(t("স্বাগতম!", "Welcome!"));
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.data?.message ?? e.message ?? "Invalid OTP");
      } else {
        toast.error("Invalid OTP");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (resendCooldown > 0) return;
    const identifier = form.getValues("identifier");
    const normalized = BD_PHONE_REGEX.test(identifier)
      ? normalizeBDPhone(identifier)
      : identifier;
    try {
      const res = await auth.startLogin({ identifier: normalized });
      if (res.nextStep === "verify") {
        setDevCode(res.devCode ?? null);
        setResendCooldown(30);
        toast.success(t("OTP পাঠানো হয়েছে", "OTP sent"));
      }
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.data?.message ?? e.message ?? "Failed to resend");
      } else {
        toast.error("Failed to resend");
      }
    }
  }

  // Bilingual helper for "check your email/phone" line.
  const channelLabel = useMemo(() => {
    if (verificationChannel === "EMAIL")
      return { bn: "আপনার ইমেইলে", en: "your email", icon: Mail };
    if (verificationChannel === "SMS")
      return { bn: "আপনার ফোনে", en: "your phone", icon: MessageSquare };
    return options.otpChannel === "SMS"
      ? { bn: "আপনার ফোনে", en: "your phone", icon: MessageSquare }
      : { bn: "আপনার ইমেইলে", en: "your email", icon: Mail };
  }, [verificationChannel, options.otpChannel]);

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
            {step === 1
              ? t("ফোন বা ইমেইল দিয়ে প্রবেশ করুন", "Sign in with phone or email")
              : t("OTP কোড দিয়ে নিশ্চিত করুন", "Verify with the OTP code")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === 1 && (
            <form
              onSubmit={form.handleSubmit(onStep1Submit)}
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
                  {t("পাসওয়ার্ড (ঐচ্ছিক)", "Password (optional)")}
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
                <p className="text-xs text-ink-500">
                  {t(
                    "খালি রাখলে OTP দিয়ে লগইন হবে",
                    "Leave empty to sign in with OTP",
                  )}
                </p>
              </div>

              <Button type="submit" disabled={submitting || !optionsLoaded} className="w-full" size="lg">
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
          )}

          {step === 2 && (
            <form
              onSubmit={otpForm.handleSubmit(onOtpSubmit)}
              className="space-y-4"
            >
              <div className="flex items-start gap-2 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-left text-xs text-primary-800 dark:border-primary-700 dark:bg-primary-700/20 dark:text-primary-100">
                <channelLabel.icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  {t(
                    `${channelLabel.bn} একটি কোড পাঠানো হয়েছে${maskedTarget ? ` (${maskedTarget})` : ""}`,
                    `We sent a code to ${channelLabel.en}${maskedTarget ? ` (${maskedTarget})` : ""}`,
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("OTP কোড", "OTP code")}
                </label>
                <Input
                  inputMode="numeric"
                  maxLength={options.otpLength}
                  placeholder={"•".repeat(options.otpLength)}
                  autoComplete="one-time-code"
                  className="text-center text-lg tracking-widest"
                  {...otpForm.register("code")}
                />
                {otpForm.formState.errors.code && (
                  <p className="text-xs text-danger-500">
                    {otpForm.formState.errors.code.message}
                  </p>
                )}
                {devCode && (
                  <button
                    type="button"
                    onClick={() =>
                      otpForm.setValue("code", devCode, { shouldValidate: true })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50"
                  >
                    <span className="font-semibold text-amber-900 dark:text-amber-200">
                      {t("ডেভ OTP (ক্লিক করে পূরণ করুন):", "Dev OTP (click to autofill):")}
                    </span>
                    <span className="font-mono text-base font-bold tracking-widest text-amber-900 dark:text-amber-100">
                      {devCode}
                    </span>
                  </button>
                )}
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                    }}
                    className="text-ink-500 hover:underline"
                  >
                    {t("অন্য পদ্ধতি ব্যবহার করুন", "Use a different method")}
                  </button>
                  <button
                    type="button"
                    onClick={onResend}
                    disabled={resendCooldown > 0}
                    className="text-primary-700 hover:underline disabled:text-ink-400 dark:text-primary-100"
                  >
                    {resendCooldown > 0
                      ? t(`${resendCooldown}s এ পুনঃপাঠান`, `Resend in ${resendCooldown}s`)
                      : t("আবার পাঠান", "Resend")}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={submitting} className="w-full" size="lg">
                {submitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    {t("যাচাই করুন", "Verify")}
                  </>
                )}
              </Button>
            </form>
          )}

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
