"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, KeyRound, Phone, ShieldCheck } from "lucide-react";
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
  PHONE_ERROR_BN,
  PHONE_ERROR_EN,
  normalizeBDPhone,
} from "@/lib/validation";

type Step = 1 | 2;

const phoneSchema = z.object({
  phone: z
    .string()
    .min(1)
    .regex(BD_PHONE_REGEX, { message: PHONE_ERROR_EN }),
});

const resetSchema = z.object({
  code: z
    .string()
    .length(6, { message: "OTP must be 6 digits" })
    .regex(/^\d{6}$/, { message: "OTP must be 6 digits" }),
  newPassword: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

// Route Segment Config — see apps/web/app/(public)/cart/page.tsx for rationale.
// This is a fully client-side form page; prerendering it in CI just hangs.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const { lang } = useTheme();
  const delivery = useDeliveryPublicSafe();
  const auth = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [phone, setPhone] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const phoneErr = lang === "bn" ? PHONE_ERROR_BN : PHONE_ERROR_EN;

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });
  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: "", newPassword: "" },
  });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  async function sendOtp(phoneNumber: string) {
    try {
      const res = await auth.forgotPassword(phoneNumber);
      setDevCode(res.devCode ?? null);
      setResendCooldown(30);
      toast.success(
        t(
          "OTP পাঠানো হয়েছে",
          "If the number is registered, an OTP has been sent",
        ),
      );
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
      // toast already shown
    } finally {
      setSubmitting(false);
    }
  }

  async function onResetSubmit(values: z.infer<typeof resetSchema>) {
    setSubmitting(true);
    try {
      const user = await auth.resetPassword(phone, values.code, values.newPassword);
      toast.success(t("পাসওয়ার্ড পরিবর্তন হয়েছে", `Welcome, ${user.name}!`));
      window.location.href = "/";
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = String(e.data?.message ?? e.message ?? "");
        toast.error(msg || "Reset failed");
      } else {
        toast.error("Reset failed");
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
            {t("পাসওয়ার্ড রিসেট", "Reset password")}
          </CardTitle>
          <p className="text-sm text-muted-foreground italic mt-1">
            {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
          </p>
          <CardDescription>
            {step === 1
              ? t(
                  "আপনার নম্বর দিন — আমরা একটি OTP পাঠাব",
                  "Enter your number — we'll send an OTP",
                )
              : t(
                  `OTP ও নতুন পাসওয়ার্ড দিন (+880${phone.replace(/^0/, "")})`,
                  `Enter the OTP and a new password (+880${phone.replace(/^0/, "")})`,
                )}
          </CardDescription>
        </CardHeader>

        <CardContent>
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

          {step === 2 && (
            <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
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
                  {...resetForm.register("code")}
                />
                {devCode && (
                  <button
                    type="button"
                    onClick={() =>
                      resetForm.setValue("code", devCode, { shouldValidate: true })
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
                {resetForm.formState.errors.code && (
                  <p className="text-xs text-danger-500">
                    {resetForm.formState.errors.code.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("নতুন পাসওয়ার্ড", "New password")}
                </label>
                <NewPasswordInput registration={resetForm.register("newPassword")} />
                {resetForm.formState.errors.newPassword && (
                  <p className="text-xs text-danger-500">
                    {resetForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={submitting} className="w-full" size="lg">
                {submitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    {t("পাসওয়ার্ড পরিবর্তন করুন", "Update password")}
                  </>
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-primary-700 hover:underline dark:text-primary-100"
            >
              <ArrowLeft className="h-3 w-3" />
              {t("লগইন পেজে ফিরে যান", "Back to sign in")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewPasswordInput({ registration }: { registration: any }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        placeholder="••••••••"
        autoComplete="new-password"
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
