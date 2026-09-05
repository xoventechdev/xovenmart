"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
} from "lucide-react";
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

/**
 * Identifier (phone OR email) is required. Mirrors the new flexible
 * `/login` flow — the backend decides whether the input is a phone or
 * an email via `findUserByIdentifier` and picks the OTP channel
 * accordingly. The OTP step accepts the configured-length code + a
 * new password (≥6 chars).
 *
 * Shape detection (phone vs email) happens client-side for UX (we
 * use BD_PHONE_REGEX to decide whether to type=tel the input and to
 * pick the placeholder), but the server decides for real.
 */
const step1Schema = z.object({
  identifier: z
    .string()
    .min(4, { message: "Enter your phone or email" }),
});

const step2Schema = (otpLength: number) =>
  z.object({
    code: z
      .string()
      .length(otpLength, { message: `OTP must be ${otpLength} digits` })
      .regex(new RegExp(`^\\d{${otpLength}}$`), {
        message: `OTP must be ${otpLength} digits`,
      }),
    newPassword: z
      .string()
      .min(6, { message: "Password must be at least 6 characters" })
      .max(72, { message: "Password must be at most 72 characters" }),
    confirmPassword: z.string().min(6, {
      message: "Confirm your new password",
    }),
  }).refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type Step = 1 | 2;

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordPageInner />
    </Suspense>
  );
}

function ForgotPasswordPageInner() {
  const { lang } = useTheme();
  const delivery = useDeliveryPublicSafe();
  const general = useGeneralSettingsSafe();
  const auth = useAuth();
  const router = useRouter();

  // Already-signed-in guard — same pattern as /login and /register.
  // A logged-in user shouldn't be resetting their password.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    router.replace("/");
  }, [auth.isAuthenticated, router]);

  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showPwd, setShowPwd] = useState(false);

  // Pull admin-configured OTP options on mount. We need otpLength to
  // size the zod validation. Defaults mirror the backend so the page
  // still works if the request fails.
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

  const step1Form = useForm<z.infer<typeof step1Schema>>({
    resolver: zodResolver(step1Schema),
    defaultValues: { identifier: "" },
  });

  // Step-2 schema is built dynamically so the OTP length matches the
  // server-configured otpLength.
  const step2ZodSchema = useMemo(
    () => step2Schema(options.otpLength),
    [options.otpLength],
  );
  const step2Form = useForm<z.infer<ReturnType<typeof step2Schema>>>({
    resolver: zodResolver(step2ZodSchema),
    defaultValues: { code: "", newPassword: "", confirmPassword: "" },
  });

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(
      () => setResendCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Client-side shape detection (UX hint only). If the user is typing
  // an email, use type=email; if phone-like, use type=tel.
  const identifierShape = useMemo(() => {
    const v = step1Form.watch("identifier") ?? "";
    if (EMAIL_REGEX.test(v)) return "email" as const;
    if (/^[+\d][\d\s\-]*$/.test(v)) return "phone" as const;
    return "unknown" as const;
  }, [step1Form]);

  // Persisted across step 1 → step 2 — the server resolves the kind
  // and routes the OTP to the right channel.
  const [submittedIdentifier, setSubmittedIdentifier] = useState<string>("");

  async function onStep1Submit(values: z.infer<typeof step1Schema>) {
    setSubmitting(true);
    try {
      const identifier = values.identifier.trim();
      const normalized = BD_PHONE_REGEX.test(identifier)
        ? normalizeBDPhone(identifier)
        : identifier;

      await auth.forgotPasswordByIdentifier(normalized);
      setSubmittedIdentifier(normalized);
      setResendCooldown(30);
      setStep(2);
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.data?.message ?? e.message ?? "Failed to send OTP");
      } else {
        toast.error("Failed to send OTP");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onStep2Submit(
    values: z.infer<ReturnType<typeof step2Schema>>,
  ) {
    setSubmitting(true);
    try {
      const user = await auth.resetPasswordByIdentifier(
        submittedIdentifier,
        values.code,
        values.newPassword,
      );
      // Refresh the auth context so the new session is picked up
      // everywhere (header dropdown, /account, etc.).
      await auth.refreshMe();
      toast.success(t("পাসওয়ার্ড পরিবর্তন হয়েছে", `Welcome, ${user.name}!`));
      window.location.href = "/";
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = String(e.data?.message ?? e.message ?? "");
        const code = msg.toUpperCase();
        if (code.includes("INVALID CODE")) {
          toast.error(t("ভুল OTP কোড", "Invalid code"));
        } else if (
          code.includes("NO VALID") ||
          code.includes("REQUEST A NEW")
        ) {
          toast.error(
            t(
              "OTP মেয়াদ শেষ — নতুন একটি পাঠান",
              "Code expired — please request a new one",
            ),
          );
        } else {
          toast.error(msg || t("রিসেট ব্যর্থ", "Reset failed"));
        }
      } else {
        toast.error(t("রিসেট ব্যর্থ", "Reset failed"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (resendCooldown > 0) return;
    if (!submittedIdentifier) return;
    try {
      await auth.forgotPasswordByIdentifier(submittedIdentifier);
      setResendCooldown(30);
      toast.success(t("OTP পাঠানো হয়েছে", "OTP sent"));
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.data?.message ?? e.message ?? "Failed to resend");
      } else {
        toast.error("Failed to resend");
      }
    }
  }

  // Mask the submitted identifier so we can echo "we sent a code to
  // <masked>" without leaking the full address in screenshots.
  const maskedEcho = useMemo(() => {
    const id = submittedIdentifier.trim();
    if (!id) return "";
    if (EMAIL_REGEX.test(id)) {
      const [local, domain] = id.split("@");
      if (!local || !domain) return id;
      const head = local.slice(0, 2);
      return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
    }
    // Phone
    if (id.length <= 4) return id;
    return `${id.slice(0, 4)}${"*".repeat(Math.max(0, id.length - 7))}${id.slice(-3)}`;
  }, [submittedIdentifier]);

  const channelLabel = useMemo(() => {
    // The backend returns a generic message ("if an account exists, …")
    // and doesn't expose which channel was used. Best-effort UX hint
    // based on what the user typed: phone-shaped → SMS, otherwise → email.
    if (identifierShape === "phone")
      return { bn: "আপনার ফোনে", en: "your phone", icon: MessageSquare };
    if (identifierShape === "email")
      return { bn: "আপনার ইমেইলে", en: "your email", icon: Mail };
    return { bn: "আপনার ফোন বা ইমেইলে", en: "your phone or email", icon: Mail };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifierShape]);

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
            {t("পাসওয়ার্ড রিসেট", "Reset password")}
          </CardTitle>
          <p className="text-sm text-muted-foreground italic mt-1">
            {lang === "en" ? delivery.brandTaglineEn : delivery.brandTaglineBn}
          </p>
          <CardDescription>
            {step === 1
              ? t(
                  "ফোন বা ইমেইল দিন — আমরা একটি কোড পাঠাব",
                  "Enter your phone or email — we'll send a code",
                )
              : t(
                  "OTP ও নতুন পাসওয়ার্ড দিন",
                  "Enter the OTP and a new password",
                )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === 1 && (
            <form
              onSubmit={step1Form.handleSubmit(onStep1Submit)}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("ফোন বা ইমেইল", "Phone or email")}
                </label>
                <Input
                  type={
                    identifierShape === "email"
                      ? "email"
                      : identifierShape === "phone"
                      ? "tel"
                      : "text"
                  }
                  inputMode={identifierShape === "phone" ? "numeric" : "text"}
                  placeholder="01XXXXXXXXX or you@example.com"
                  autoComplete="username"
                  {...step1Form.register("identifier")}
                />
                {step1Form.formState.errors.identifier && (
                  <p className="text-xs text-danger-500">
                    {step1Form.formState.errors.identifier.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={submitting || !optionsLoaded}
                className="w-full"
                size="lg"
              >
                {submitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {t("OTP পাঠান", "Send code")}
                  </>
                )}
              </Button>
            </form>
          )}

          {step === 2 && (
            <form
              onSubmit={step2Form.handleSubmit(onStep2Submit)}
              className="space-y-4"
            >
              <div className="flex items-start gap-2 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-left text-xs text-primary-800 dark:border-primary-700 dark:bg-primary-700/20 dark:text-primary-100">
                <channelLabel.icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  {t(
                    `${channelLabel.bn} একটি কোড পাঠানো হয়েছে${maskedEcho ? ` (${maskedEcho})` : ""}`,
                    `We sent a code to ${channelLabel.en}${maskedEcho ? ` (${maskedEcho})` : ""}`,
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
                  {...step2Form.register("code")}
                />
                {step2Form.formState.errors.code && (
                  <p className="text-xs text-danger-500">
                    {step2Form.formState.errors.code.message}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      step2Form.reset();
                    }}
                    className="text-ink-500 hover:underline"
                  >
                    {t("অন্য নম্বর/ইমেইল ব্যবহার করুন", "Use a different identifier")}
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

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("নতুন পাসওয়ার্ড", "New password")}
                </label>
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    {...step2Form.register("newPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((x) => !x)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-500 hover:text-ink-900"
                  >
                    {showPwd ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {step2Form.formState.errors.newPassword && (
                  <p className="text-xs text-danger-500">
                    {step2Form.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                  {t("পাসওয়ার্ড আবার দিন", "Confirm password")}
                </label>
                <Input
                  type={showPwd ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...step2Form.register("confirmPassword")}
                />
                {step2Form.formState.errors.confirmPassword && (
                  <p className="text-xs text-danger-500">
                    {step2Form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full"
                size="lg"
              >
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
