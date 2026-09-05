"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  LogIn,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand-lockup";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { useFeatureToggles } from "@/lib/use-feature-toggles";
import { useAuth, LoginOptions } from "@/lib/auth";
import { useReferralPreview } from "@/lib/use-referrals";
import { ApiError } from "@/lib/api";
import {
  BD_PHONE_REGEX,
  EMAIL_REGEX,
  PHONE_ERROR_BN,
  PHONE_ERROR_EN,
  normalizeBDPhone,
} from "@/lib/validation";

const REF_COOKIE = "xm-ref";

/** Read a cookie value by name. Returns null on SSR / missing. */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
  }
  return null;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Step 1 schema — collects EVERYTHING the backend needs to create the
 * User row in one go. Per the agreed UX:
 *   - name (full name, min 2 chars)
 *   - phone (BD format, required, unique)
 *   - email (required, unique, valid shape — both must be unique per
 *     business requirement)
 *   - password (min 6 chars — needed for the no-OTP flow)
 *   - referralCode (optional, 8-char alphanumeric)
 *
 * The OTP step's length comes from `LoginOptions.otpLength` so we build
 * the schema dynamically once we have the options.
 */
function makeDetailsSchema(otpLength: number) {
  return z.object({
    name: z.string().min(2, { message: "Name must be at least 2 characters" }),
    phone: z
      .string()
      .min(1, { message: PHONE_ERROR_EN })
      .regex(BD_PHONE_REGEX, { message: PHONE_ERROR_EN }),
    email: z
      .string()
      .min(1, { message: "Email is required" })
      .regex(EMAIL_REGEX, { message: "Enter a valid email" }),
    password: z
      .string()
      .min(6, { message: "Password must be at least 6 characters" })
      .max(72, { message: "Password must be at most 72 characters" }),
    referralCode: z
      .string()
      .optional()
      .refine((v) => !v || /^[A-Za-z0-9]{8}$/.test(v), {
        message: "Referral code must be 8 alphanumeric characters",
      }),
  });
}

const otpSchema = (length: number) =>
  z.object({
    code: z
      .string()
      .length(length, { message: `OTP must be ${length} digits` })
      .regex(new RegExp(`^\\d{${length}}$`), { message: `OTP must be ${length} digits` }),
  });

type Step = 1 | 2;

export default function PublicRegisterPage() {
  return (
    <Suspense fallback={null}>
      <PublicRegisterPageInner />
    </Suspense>
  );
}

function PublicRegisterPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useTheme();
  const delivery = useDeliveryPublicSafe();
  const general = useGeneralSettingsSafe();
  const featureToggles = useFeatureToggles();
  const auth = useAuth();

  // Already-signed-in guard — bounce to home if the user has a valid
  // customer session cached.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    router.replace("/");
  }, [auth.isAuthenticated, router]);

  // Pull the admin-configured login options on mount. We use these to
  //   1. decide whether to show the OTP step at all (otpRequired),
  //   2. size the OTP input mask + zod length (otpLength),
  //   3. show the right confirmation banner ("check your email" vs
  //      "check your phone" — verificationChannel).
  // Defaults (in case the request fails) mirror the backend defaults so
  // the page still works offline-ish.
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
        // Keep defaults — the page works either way.
        if (!cancelled) setOptionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Query params / referral cookie → prefill
  const queryRef = useMemo(() => (params.get("ref") ?? "").toUpperCase().trim(), [params]);

  const detailsSchema = useMemo(() => makeDetailsSchema(options.otpLength), [options.otpLength]);
  const otpZodSchema = useMemo(() => otpSchema(options.otpLength), [options.otpLength]);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const phoneErr = lang === "bn" ? PHONE_ERROR_BN : PHONE_ERROR_EN;

  const detailsForm = useForm<z.infer<ReturnType<typeof makeDetailsSchema>>>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      password: "",
      referralCode: "",
    },
  });
  const otpForm = useForm<z.infer<ReturnType<typeof otpSchema>>>({
    resolver: zodResolver(otpZodSchema),
    defaultValues: { code: "" },
  });

  // Referral code from the share landing page. URL `?ref=` wins over
  // the `xm-ref` cookie. If a logged-in user somehow arrives at
  // /register, ignore the cookie so we don't mark their session as
  // referred.
  const [referralFromInvite, setReferralFromInvite] = useState<string>("");
  useEffect(() => {
    if (auth.isAuthenticated) {
      clearCookie(REF_COOKIE);
      return;
    }
    let resolved = "";
    if (queryRef && /^[A-Z0-9]{8}$/.test(queryRef)) {
      resolved = queryRef;
    } else {
      const fromCookie = readCookie(REF_COOKIE);
      if (fromCookie && /^[A-Z0-9]{8}$/.test(fromCookie.toUpperCase())) {
        resolved = fromCookie.toUpperCase();
      }
    }
    if (resolved) {
      setReferralFromInvite(resolved);
      detailsForm.setValue("referralCode", resolved, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryRef, auth.isAuthenticated]);

  // Wizard state — OTP userId (from startRegistration) and the dev OTP
  // (only present in non-prod).
  const [step, setStep] = useState<Step>(1);
  const [otpUserId, setOtpUserId] = useState<string>("");
  const [verificationChannel, setVerificationChannel] = useState<"EMAIL" | "SMS" | null>(null);
  const [maskedTarget, setMaskedTarget] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Inline duplicate-phone / duplicate-email warning. Backend now
  // returns `{ message, field }` on ConflictException for both. We
  // surface an inline card with a clear next step and keep the user on
  // the same step (no hostile redirect to /login).
  const [duplicateField, setDuplicateField] = useState<
    { field: "phone" | "email"; value: string } | null
  >(null);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  /**
   * Re-issue the OTP for the in-flight registration. Mirrors the old
   * register page's sendOtp pattern — used by the resend button.
   */
  async function resendOtp(): Promise<boolean> {
    if (!otpUserId) return false;
    try {
      // Resend by re-submitting the same step-1 details. This is the
      // simplest correct way: the backend regenerates the OTP and we
      // get a fresh devCode + cooldown. Pulling the values back from
      // the form keeps the resend a no-op if the user edited something.
      const values = detailsForm.getValues();
      const res = await auth.startRegistration({
        name: values.name,
        phone: normalizeBDPhone(values.phone),
        email: values.email,
        password: values.password,
        referralCode: values.referralCode || undefined,
      });
      if (res.nextStep === "verify") {
        setDevCode(res.devCode ?? null);
        setResendCooldown(30);
        toast.success(t("OTP পাঠানো হয়েছে", "OTP sent"));
        return true;
      }
      return false;
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.data?.message ?? e.message ?? "Failed to resend OTP");
      } else {
        toast.error("Failed to resend OTP");
      }
      return false;
    }
  }

  async function onDetailsSubmit(values: z.infer<ReturnType<typeof makeDetailsSchema>>) {
    setDuplicateField(null);
    setSubmitting(true);
    try {
      const phone = normalizeBDPhone(values.phone);
      const res = await auth.startRegistration({
        name: values.name,
        phone,
        email: values.email,
        password: values.password,
        referralCode: values.referralCode || undefined,
      });

      if (res.nextStep === "complete" && res.user) {
        // Admin has OTP disabled — tokens are already in the payload.
        clearCookie(REF_COOKIE);
        toast.success(t("অ্যাকাউন্ট তৈরি হয়েছে", `Welcome, ${res.user.name}!`));
        const next = new URLSearchParams(window.location.search).get("next") || "/";
        window.location.href = next;
        return;
      }

      // nextStep === "verify" — show the OTP step.
      if (res.userId) {
        setOtpUserId(res.userId);
        setVerificationChannel(res.verificationChannel ?? null);
        setMaskedTarget(res.maskedTarget ?? "");
        setDevCode(res.devCode ?? null);
        setResendCooldown(30);
        setStep(2);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const dataAny: any = e.data ?? {};
        const dataField =
          typeof dataAny.field === "string" ? dataAny.field.toLowerCase() : "";
        const msg = String(dataAny.message ?? e.message ?? "");
        const emailCollision =
          dataField === "email" || /email.*(already|in use|exists)/i.test(msg);
        const phoneCollision =
          dataField === "phone" ||
          e.status === 409 ||
          /phone.*(already|in use|exists|registered)/i.test(msg);

        if (emailCollision) {
          setDuplicateField({ field: "email", value: values.email });
          toast.warning(
            t(
              "এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে — অন্য ইমেইল দিন",
              "This email is already in use — please try another",
            ),
          );
          return;
        }
        if (phoneCollision) {
          setDuplicateField({ field: "phone", value: normalizeBDPhone(values.phone) });
          toast.warning(
            t(
              "এই নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে",
              "This number is already registered",
            ),
          );
          return;
        }
        toast.error(msg || "Registration failed");
      } else {
        toast.error("Registration failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onOtpSubmit(values: z.infer<ReturnType<typeof otpSchema>>) {
    if (!otpUserId) return;
    setSubmitting(true);
    try {
      await auth.verifyRegistration(otpUserId, values.code);
      clearCookie(REF_COOKIE);
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
    await resendOtp();
  }

  // Bilingual helper for "check your phone / email" line shown above the
  // OTP input. `verificationChannel` is what the backend reported.
  const channelLabel = useMemo(() => {
    if (verificationChannel === "EMAIL")
      return { bn: "আপনার ইমেইলে", en: "your email", icon: Mail };
    if (verificationChannel === "SMS")
      return { bn: "আপনার ফোনে", en: "your phone", icon: MessageSquare };
    // Fallback when the backend didn't tell us (shouldn't happen in
    // practice — the field is always populated for the verify step).
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
            {t("অ্যাকাউন্ট তৈরি করুন", "Create your account")}
          </CardTitle>
          <p className="text-sm text-muted-foreground italic mt-1">
            {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
          </p>
          <CardDescription>
            {t(
              "কয়েক ধাপে অ্যাকাউন্ট তৈরি করুন",
              "Create your account in a few steps",
            )}
          </CardDescription>

          {/* Referral invite preview banner — shown when we have a
              referral code (from ?ref= or xm-ref cookie) and the toggle
              is on. */}
          {featureToggles.enableReferrals && referralFromInvite && step === 1 && (
            <ReferralInviteBanner code={referralFromInvite} t={t} />
          )}

          {/* Step indicator — only show both pills if OTP is actually
              required. When admin has OTP off, the whole flow collapses
              to a single step (we go straight home on submit). */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {[1, ...(options.otpRequired ? [2] : [])].map((s) => (
              <div
                key={s}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  step >= (s as Step)
                    ? "bg-primary text-white"
                    : "bg-ink-200 text-ink-500 dark:bg-ink-200"
                }`}
              >
                {step > (s as Step) ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {/* Registration closed by admin */}
          {!featureToggles.registrationOpen && (
            <div className="mb-4 rounded-md border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-500 dark:bg-warning-500/20 dark:text-warning-100">
              {t(
                "অ্যাডমিন নতুন রেজিস্ট্রেশন সাময়িকভাবে বন্ধ রেখেছেন।",
                "New registrations are temporarily closed by the admin.",
              )}
            </div>
          )}

          {/* Step 1 — name + phone + email + password (+ optional referral) */}
          {step === 1 && featureToggles.registrationOpen && (
            <form
              onSubmit={detailsForm.handleSubmit(onDetailsSubmit)}
              className="space-y-4"
            >
              {/* Duplicate field warning — phone OR email. The user
                  stays on step 1 with everything preserved except the
                  offending field, which gets a "Use a different one"
                  button below the input. */}
              {duplicateField && (
                <div className="rounded-md border border-warning-300 bg-warning-50 p-3 text-sm dark:border-warning-500 dark:bg-warning-500/20">
                  <p className="font-semibold text-warning-800 dark:text-warning-100">
                    {duplicateField.field === "email"
                      ? t("এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে", "This email is already in use")
                      : t("এই নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে", "This number is already registered")}
                  </p>
                  <p className="mt-1 text-xs text-warning-700 dark:text-warning-100">
                    {duplicateField.field === "email"
                      ? t(
                          `${duplicateField.value} ইমেইল দিয়ে একটি অ্যাকাউন্ট ইতিমধ্যে আছে। অন্য ইমেইল দিন।`,
                          `An account already exists for ${duplicateField.value}. Please use a different email.`,
                        )
                      : t(
                          `${duplicateField.value} নম্বর দিয়ে একটি অ্যাকাউন্ট ইতিমধ্যে আছে। অন্য নম্বর দিন অথবা লগইন করুন।`,
                          `An account already exists for ${duplicateField.value}. Try a different number or sign in.`,
                        )}
                  </p>
                  {duplicateField.field === "phone" && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        asChild
                        size="sm"
                        variant="default"
                        className="flex-1"
                      >
                        <Link
                          href={`/login?phone=${encodeURIComponent(duplicateField.value)}`}
                        >
                          <LogIn className="h-4 w-4" />
                          {t("লগইন করুন", "Sign in")}
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setDuplicateField(null);
                          detailsForm.setValue("phone", "", { shouldValidate: false });
                        }}
                      >
                        {t("অন্য নম্বর ব্যবহার করুন", "Use a different number")}
                      </Button>
                    </div>
                  )}
                  {duplicateField.field === "email" && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setDuplicateField(null);
                          detailsForm.setValue("email", "", { shouldValidate: false });
                          const el = document.getElementById(
                            "register-details-email",
                          ) as HTMLInputElement | null;
                          if (el) el.focus();
                        }}
                      >
                        {t("অন্য ইমেইল দিন", "Use a different email")}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("আপনার নাম", "Your name")}
                </label>
                <Input
                  type="text"
                  placeholder={t("কামাল হোসেন", "Kamal Hosen")}
                  autoComplete="name"
                  {...detailsForm.register("name")}
                />
                {detailsForm.formState.errors.name && (
                  <p className="text-xs text-danger-500">
                    {detailsForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("মোবাইল নম্বর", "Phone number")}
                </label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  placeholder="01XXXXXXXXX"
                  autoComplete="username"
                  {...detailsForm.register("phone")}
                />
                {detailsForm.formState.errors.phone && (
                  <p className="text-xs text-danger-500">{phoneErr}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("ইমেইল", "Email")}
                </label>
                <Input
                  id="register-details-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...detailsForm.register("email")}
                />
                {detailsForm.formState.errors.email && (
                  <p className="text-xs text-danger-500">
                    {detailsForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("পাসওয়ার্ড", "Password")}
                </label>
                <PasswordInput
                  registration={detailsForm.register("password")}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
                {detailsForm.formState.errors.password && (
                  <p className="text-xs text-danger-500">
                    {detailsForm.formState.errors.password.message}
                  </p>
                )}
                <p className="text-xs text-ink-500">
                  {t("পরবর্তীতে লগইন করতে ব্যবহার করুন", "Use this to log in next time")}
                </p>
              </div>

              {/* Referral code (optional) — only when admin has the
                  toggle on. */}
              {featureToggles.enableReferrals && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                    {t("রেফারেল কোড (ঐচ্ছিক)", "Referral code (optional)")}
                  </label>
                  <Input
                    type="text"
                    placeholder="XVM4K7P2"
                    maxLength={8}
                    {...detailsForm.register("referralCode", {
                      setValueAs: (v) => (typeof v === "string" ? v.toUpperCase() : v),
                    })}
                  />
                  {detailsForm.formState.errors.referralCode && (
                    <p className="text-xs text-danger-500">
                      {detailsForm.formState.errors.referralCode.message}
                    </p>
                  )}
                </div>
              )}

              <Button type="submit" disabled={submitting || !optionsLoaded} className="w-full" size="lg">
                {submitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : options.otpRequired ? (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    {t("যাচাই করতে এগিয়ে যান", "Continue to verification")}
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4" />
                    {t("অ্যাকাউন্ট তৈরি করুন", "Create account")}
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Step 2 — OTP verify (only when admin has OTP on) */}
          {step === 2 && options.otpRequired && featureToggles.registrationOpen && (
            <form
              onSubmit={otpForm.handleSubmit(onOtpSubmit)}
              className="space-y-4"
            >
              {/* "Check your email/phone" confirmation banner — uses
                  the channel reported by the backend so the user knows
                  where to look. */}
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
                      setDuplicateField(null);
                    }}
                    className="text-ink-500 hover:underline"
                  >
                    {t("তথ্য বদলান", "Edit details")}
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
            {step === 1 && (
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-ink-700 hover:text-ink-900 dark:text-ink-50"
              >
                <LogIn className="h-3 w-3" />
                {t("ইতোমধ্যে অ্যাকাউন্ট আছে? লগইন করুন", "Already have an account? Sign in")}
              </Link>
            )}
            {step === 2 && (
              <Link
                href="/login"
                className="text-xs text-ink-500 hover:underline"
              >
                {t("পাসওয়ার্ড দিয়ে লগইন করুন", "Sign in with password")}
                <ArrowRight className="inline h-3 w-3" />
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordInput({
  registration,
  ...rest
}: {
  registration: any;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder={rest.placeholder}
        autoComplete={rest.autoComplete}
        {...registration}
      />
      <button
        type="button"
        onClick={() => setShow((x) => !x)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-500 hover:text-ink-900"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * Tiny banner above the registration form when the user came in via a
 * share link. Calls the public `/referral-codes/:code` endpoint so we
 * can show "Invited by Rahim" instead of a generic "you have a code"
 * message. Stays quiet on miss — never breaks the form.
 */
function ReferralInviteBanner({
  code,
  t,
}: {
  code: string;
  t: (bn: string, en: string) => string;
}) {
  const preview = useReferralPreview(code);
  const referrerName =
    preview.data?.valid &&
    (preview.data.referrerFullName || preview.data.referrerName)
      ? preview.data.referrerFullName || preview.data.referrerName
      : null;

  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-left text-xs text-success-800 dark:border-success-700 dark:bg-success-700/20 dark:text-success-100">
      <Gift className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div>
        {referrerName ? (
          <span>
            {t("আপনাকে আমন্ত্রণ জানিয়েছেন", "You've been invited by")}{" "}
            <span className="font-semibold">{referrerName}</span>
            {t(" — উভয়পক্ষ ৳50 পাবেন", " — you'll both get ৳50")}
          </span>
        ) : (
          <span>
            {t(
              "আপনাকে XovenMart এ আমন্ত্রণ জানানো হয়েছে — প্রথম অর্ডারে ৳50 ছাড়",
              "You've been invited to XovenMart — get ৳50 off your first order",
            )}
          </span>
        )}
      </div>
    </div>
  );
}
