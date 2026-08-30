"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LogIn, Phone, ShieldCheck, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import {
  BD_PHONE_REGEX,
  EMAIL_REGEX,
  PHONE_ERROR_BN,
  PHONE_ERROR_EN,
  normalizeBDPhone,
} from "@/lib/validation";

type Step = 1 | 2 | 3;

const phoneSchema = z.object({
  phone: z
    .string()
    .min(1)
    .regex(BD_PHONE_REGEX, { message: PHONE_ERROR_EN }),
});

const otpSchema = z.object({
  code: z
    .string()
    .length(6, { message: "OTP must be 6 digits" })
    .regex(/^\d{6}$/, { message: "OTP must be 6 digits" }),
});

const detailsSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  email: z
    .string()
    .optional()
    .refine((v) => !v || EMAIL_REGEX.test(v), { message: "Enter a valid email" }),
  referralCode: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z0-9]{8}$/.test(v), {
      message: "Referral code must be 8 alphanumeric characters",
    }),
});

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
  const auth = useAuth();

  // ?phone=...&setup=1 → start at step 3 (came here from login because password wasn't set).
  const queryPhone = useMemo(() => params.get("phone") ?? "", [params]);
  const setupMode = params.get("setup") === "1";
  const [step, setStep] = useState<Step>(setupMode && queryPhone ? 3 : 1);
  const [phone, setPhone] = useState<string>(queryPhone ? normalizeBDPhone(queryPhone) : "");
  const [otpCode, setOtpCode] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const phoneErr = lang === "bn" ? PHONE_ERROR_BN : PHONE_ERROR_EN;

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone },
  });
  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });
  const detailsForm = useForm<z.infer<typeof detailsSchema>>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: "", password: "", email: "", referralCode: "" },
  });

  // Sync URL-provided phone into the form (for setup flow).
  useEffect(() => {
    if (queryPhone) {
      const norm = normalizeBDPhone(queryPhone);
      setPhone(norm);
      phoneForm.setValue("phone", norm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryPhone]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  async function sendOtp(phoneNumber: string) {
    try {
      const res = await auth.requestRegistrationOtp(phoneNumber);
      setDevCode(res.devCode ?? null);
      setResendCooldown(30);
      toast.success(t("OTP পাঠানো হয়েছে", "OTP sent"));
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.data?.message ?? e.message ?? "Failed to send OTP");
      } else {
        toast.error("Failed to send OTP");
      }
      throw e;
    }
  }

  async function onPhoneSubmit(values: z.infer<typeof phoneSchema>) {
    setSubmitting(true);
    try {
      const norm = normalizeBDPhone(values.phone);
      setPhone(norm);
      await sendOtp(norm);
      setStep(2);
    } catch {
      // already toasted
    } finally {
      setSubmitting(false);
    }
  }

  async function onOtpSubmit(values: z.infer<typeof otpSchema>) {
    setSubmitting(true);
    try {
      const res = await auth.verifyOtp(phone, values.code);
      if (res.firstTimeSetupRequired) {
        toast.info(
          t(
            "অ্যাকাউন্ট সেটআপ সম্পূর্ণ করুন",
            "Please complete your account setup",
          ),
        );
        setOtpCode(values.code);
        setStep(3);
      } else if (res.registrationRequired) {
        toast.success(t("ফোন যাচাই হয়েছে", "Phone verified"));
        setOtpCode(values.code);
        setStep(3);
      } else if (res.user && res.accessToken) {
        toast.success(t("স্বাগতম!", "Welcome back!"));
        const next = new URLSearchParams(window.location.search).get("next") || "/";
        window.location.href = next;
      }
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

  async function onDetailsSubmit(values: z.infer<typeof detailsSchema>) {
    setSubmitting(true);
    try {
      const user = await auth.register({
        phone,
        name: values.name,
        password: values.password,
        email: values.email || undefined,
        referralCode: values.referralCode || undefined,
        otpCode,
      });
      toast.success(t("অ্যাকাউন্ট তৈরি হয়েছে", `Welcome, ${user.name}!`));
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = String(e.data?.message ?? e.message ?? "");
        if (msg.toLowerCase().includes("user already")) {
          toast.error(t("এই নম্বর দিয়ে অ্যাকাউন্ট আছে — লগইন করুন", "Account exists — please log in"));
          window.location.href = `/login?phone=${encodeURIComponent(phone)}`;
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

  async function resend() {
    if (resendCooldown > 0) return;
    try {
      await sendOtp(phone);
    } catch {}
  }

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-primary-50 px-4 py-12 dark:bg-ink-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 shadow-lg rounded-2xl overflow-hidden">
            <BrandMark size={64} />
          </div>
          <CardTitle className="text-2xl">
            {setupMode
              ? t("অ্যাকাউন্ট সেটআপ", "Complete your account")
              : t("অ্যাকাউন্ট তৈরি করুন", "Create your account")}
          </CardTitle>
          <p className="text-sm text-muted-foreground italic mt-1">
            {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
          </p>
          <CardDescription>
            {setupMode
              ? t(
                  "আপনার নাম ও পাসওয়ার্ড দিন যাতে পরে দ্রুত লগইন করতে পারেন",
                  "Set your name and password so you can log in quickly next time",
                )
              : t(
                  "কয়েক ধাপে অ্যাকাউন্ট তৈরি করুন",
                  "Create your account in a few steps",
                )}
          </CardDescription>

          {/* Step indicator */}
          {!setupMode && (
            <div className="mt-4 flex items-center justify-center gap-2">
              {[1, 2, 3].map((s) => (
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
          )}
        </CardHeader>

        <CardContent>
          {/* Step 1 — phone */}
          {step === 1 && (
            <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("মোবাইল নম্বর", "Phone number")}
                </label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  placeholder="01XXXXXXXXX"
                  autoComplete="username"
                  {...phoneForm.register("phone")}
                />
                {phoneForm.formState.errors.phone && (
                  <p className="text-xs text-danger-500">{phoneErr}</p>
                )}
                <p className="text-xs text-ink-500">
                  {t(
                    "আমরা একটি ছোট OTP কোড পাঠাব",
                    "We'll send a short OTP code",
                  )}
                </p>
              </div>
              <Button type="submit" disabled={submitting} className="w-full" size="lg">
                {submitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Phone className="h-4 w-4" />
                    {t("OTP পাঠান", "Send OTP")}
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Step 2 — OTP */}
          {step === 2 && (
            <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("OTP কোড", "OTP code")}
                </label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
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
                    onClick={() => setStep(1)}
                    className="text-ink-500 hover:underline"
                  >
                    {t("নম্বর বদলান", "Change number")}
                  </button>
                  <button
                    type="button"
                    onClick={resend}
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

          {/* Step 3 — details */}
          {step === 3 && (
            <form onSubmit={detailsForm.handleSubmit(onDetailsSubmit)} className="space-y-4">
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

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("ইমেইল (ঐচ্ছিক)", "Email (optional)")}
                </label>
                <Input
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

              {!setupMode && (
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

              <Button type="submit" disabled={submitting} className="w-full" size="lg">
                {submitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <User className="h-4 w-4" />
                    {setupMode
                      ? t("অ্যাকাউন্ট সেটআপ সম্পন্ন করুন", "Finish setup")
                      : t("অ্যাকাউন্ট তৈরি করুন", "Create account")}
                  </>
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 space-y-2 text-center text-sm">
            {step !== 2 && (
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