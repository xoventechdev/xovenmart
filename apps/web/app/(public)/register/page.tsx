"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Gift, LogIn, Phone, ShieldCheck, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand-lockup";
import { useTheme } from "@/lib/theme";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useGeneralSettingsSafe } from "@/lib/use-general-settings";
import { useFeatureToggles } from "@/lib/use-feature-toggles";
import { useAuth } from "@/lib/auth";
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
  const general = useGeneralSettingsSafe();
  const featureToggles = useFeatureToggles();
  const auth = useAuth();

  // Already-signed-in guard — same logic as /login: if the user has a
  // valid customer session cached (e.g. they opened a stale share-link
  // in a new tab, or typed /register manually after signing in),
  // bounce them to home rather than showing the form again. We
  // deliberately do NOT check `setupMode` here: a logged-in user who
  // landed on `?phone=...&setup=1` should still go home, because
  // their account already exists with a valid session — the only way
  // they'd hit setup=1 is if they previously logged out and the link
  // is stale, OR (defensively) the JWT in storage is for a different
  // phone. Either way, sending them home and letting the next API
  // call 401 if needed is correct.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    router.replace("/");
  }, [auth.isAuthenticated, router]);

  // ?phone=...&setup=1 → start at step 3 (came here from login because password wasn't set).
  const queryPhone = useMemo(() => params.get("phone") ?? "", [params]);
  const queryRef = useMemo(() => (params.get("ref") ?? "").toUpperCase().trim(), [params]);
  const setupMode = params.get("setup") === "1";
  const [step, setStep] = useState<Step>(setupMode && queryPhone ? 3 : 1);
  const [phone, setPhone] = useState<string>(queryPhone ? normalizeBDPhone(queryPhone) : "");
  const [otpCode, setOtpCode] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  // When the backend rejects send-otp with HTTP 409 (phone already
  // registered), we hold the offending number here so the step-1 form
  // can render an inline warning card. We do NOT auto-redirect to
  // /login — the user explicitly came here to create an account, and
  // forcing a redirect is hostile UX. Instead, we keep them on the
  // page with a clear message and two explicit next-step buttons
  // ("Go to login" / "Use a different number").
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);
  // Mirror for duplicate email at step 3. The backend now reports
  // `field: "email"` on a 409 so we can keep the user on the details
  // step with the offending email preserved, an inline warning, and a
  // "Use a different email" button that clears the field. They can
  // either retry with a different address or simply leave the field
  // empty (it's optional).
  const [duplicateEmail, setDuplicateEmail] = useState<string | null>(null);

  // Referral code from the share landing page. URL `?ref=` wins over the
  // `xm-ref` cookie. If a logged-in user somehow arrives at /register
  // (shouldn't happen normally — layout redirects them), ignore the
  // cookie so we don't mark their session as referred.
  const [referralFromInvite, setReferralFromInvite] = useState<string>("");
  useEffect(() => {
    if (auth.isAuthenticated) {
      // Defensive: clear any stale cookie that may have leaked in.
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
      // Prefill the step-3 field if the user already moved past step 1
      // (e.g. via `setupMode` from /login → /register?setup=1).
      detailsForm.setValue("referralCode", resolved, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryRef, auth.isAuthenticated]);

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
    defaultValues: {
      name: "",
      password: "",
      email: "",
      referralCode: referralFromInvite,
    },
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

  /**
   * Send the OTP for the given phone number. Returns `true` only when
   * the OTP was actually delivered — `false` on every failure path,
   * including the 409 duplicate-phone case. Callers MUST inspect the
   * return value before advancing the wizard; otherwise a duplicate
   * number would silently move the user to step 2 (OTP entry) even
   * though the inline warning is the entire UX response for that case.
   *
   * The duplicate-phone path is handled inline (no re-throw, no redirect)
   * because the user explicitly came here to register. Every other error
   * still re-throws so the `try/catch` in `onPhoneSubmit` keeps the
   * existing `submitting` reset behaviour.
   */
  async function sendOtp(phoneNumber: string): Promise<boolean> {
    try {
      const res = await auth.requestRegistrationOtp(phoneNumber);
      setDevCode(res.devCode ?? null);
      setResendCooldown(30);
      toast.success(t("OTP পাঠানো হয়েছে", "OTP sent"));
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = String(e.data?.message ?? e.message ?? "");
        // Backend now rejects duplicate-phone OTPs with a 409 BEFORE the
        // OTP is sent. Detect by status (preferred) or message text and
        // surface an inline warning on the register page itself — never
        // auto-redirect. The user came here to create an account, so
        // bouncing them to /login feels punishing. We show a clear
        // message + two explicit CTAs (login, or change the number) and
        // tell the caller the OTP was NOT sent.
        if (e.status === 409 || /already exists|already registered/i.test(msg)) {
          setDuplicatePhone(phoneNumber);
          toast.error(
            t(
              "এই নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে",
              "This number is already registered",
            ),
          );
          return false;
        }
        toast.error(msg || "Failed to send OTP");
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
      const sent = await sendOtp(norm);
      // Only advance to the OTP step if the request actually delivered.
      // Duplicate-phone and any other failure returns false (or throws)
      // — in those cases the wizard stays on step 1 so the user can see
      // the inline warning or correct the input.
      if (sent) {
        setStep(2);
      }
    } catch {
      // already toasted (or already redirected to /login)
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
    // Clear any prior duplicate warning so a successful retry shows a
    // clean form again.
    setDuplicateEmail(null);
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
      // Cookie has done its job — wipe it so the next visit (from any
      // device sharing this browser) doesn't auto-apply this referral.
      clearCookie(REF_COOKIE);
      toast.success(t("অ্যাকাউন্ট তৈরি হয়েছে", `Welcome, ${user.name}!`));
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
    } catch (e) {
      if (e instanceof ApiError) {
        // Backend now returns `{ message, field }` on ConflictException
        // for both phone (field: "phone") and email (field: "email")
        // collisions — see auth.service.ts register(). Branch on the
        // structured payload first, fall back to text-matching in case
        // the status code was lost by a proxy / interceptor.
        const dataAny: any = e.data ?? {};
        const dataField = typeof dataAny.field === "string" ? dataAny.field.toLowerCase() : "";
        const msg = String(dataAny.message ?? e.message ?? "");
        const emailCollision =
          dataField === "email" ||
          /email.*(already|in use|exists)/i.test(msg);
        const phoneCollision =
          dataField === "phone" ||
          e.status === 409 ||
          /already exists|already registered|user already|already in use/i.test(msg);

        if (emailCollision) {
          // Keep the user on the SAME step (3). Preserve their typed
          // name / password / referral so they only have to fix the
          // email field. Show an inline warning card with a button to
          // clear the field for a fresh entry. The email is optional —
          // they can also just remove it to continue.
          setDuplicateEmail(values.email || "");
          toast.warning(
            t(
              "এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে — অন্য ইমেইল দিন",
              "This email is already in use — please try another",
            ),
          );
          return;
        }
        if (phoneCollision) {
          // The phone path still has to bounce to /login (no point
          // keeping the user on a form whose underlying phone can't be
          // used to register a second account).
          toast.error(
            t(
              "এই নম্বর দিয়ে অ্যাকাউন্ট আছে — লগইনে যাচ্ছি",
              "This number is already registered — taking you to login",
            ),
          );
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
      const sent = await sendOtp(phone);
      // If a duplicate leaks through on resend (e.g. another tab
      // registered the number since we sent the first OTP), bounce back
      // to step 1 so the inline warning is visible. The form is already
      // mounted at step 1, so the warning will render as soon as we
      // transition.
      if (!sent) {
        setStep(1);
      }
    } catch {}
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

          {/* Referral invite preview banner — shown when we have a referral
              code (from ?ref= or xm-ref cookie) and the toggle is on. */}
          {featureToggles.enableReferrals && referralFromInvite && step !== 2 && (
            <ReferralInviteBanner code={referralFromInvite} t={t} />
          )}

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
          {/* Registration closed by admin — show a friendly message and
              keep the login link so existing users aren't stuck. The form
              below stays mounted in the (rare) case the admin flips the
              toggle back on while the page is open. */}
          {!featureToggles.registrationOpen && (
            <div className="mb-4 rounded-md border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-500 dark:bg-warning-500/20 dark:text-warning-100">
              {t(
                "অ্যাডমিন নতুন রেজিস্ট্রেশন সাময়িকভাবে বন্ধ রেখেছেন।",
                "New registrations are temporarily closed by the admin.",
              )}
            </div>
          )}

          {/* Step 1 — phone */}
          {step === 1 && featureToggles.registrationOpen && (
            <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
              {/* Duplicate-phone warning. Replaces the previous behaviour
                  that auto-redirected to /login. Stays on the register
                  page so the user isn't punished for trying to create
                  an account; offers a clear next step. Rendered above
                  the input so it's the first thing the user sees after
                  the failed attempt. */}
              {duplicatePhone && (
                <div className="rounded-md border border-warning-300 bg-warning-50 p-3 text-sm dark:border-warning-500 dark:bg-warning-500/20">
                  <p className="font-semibold text-warning-800 dark:text-warning-100">
                    {t(
                      "এই নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে",
                      "This number is already registered",
                    )}
                  </p>
                  <p className="mt-1 text-xs text-warning-700 dark:text-warning-100">
                    {t(
                      `${duplicatePhone} নম্বর দিয়ে একটি অ্যাকাউন্ট ইতিমধ্যে আছে। লগইন করুন অথবা অন্য নম্বর দিয়ে চেষ্টা করুন।`,
                      `An account already exists for ${duplicatePhone}. Please sign in or try a different number.`,
                    )}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button
                      asChild
                      size="sm"
                      variant="default"
                      className="flex-1"
                    >
                      <Link href={`/login?phone=${encodeURIComponent(duplicatePhone)}`}>
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
                        // Clear the warning and reset the phone field so
                        // the user can type a new number without manual
                        // deletion.
                        setDuplicatePhone(null);
                        phoneForm.setValue("phone", "", { shouldValidate: false });
                      }}
                    >
                      {t("অন্য নম্বর ব্যবহার করুন", "Use a different number")}
                    </Button>
                  </div>
                </div>
              )}
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
              <Button type="submit" disabled={submitting || !!duplicatePhone} className="w-full" size="lg">
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
          {step === 2 && featureToggles.registrationOpen && (
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
                    onClick={() => {
                      setStep(1);
                      // Reset the duplicate warning too — it referred
                      // to a phone number that the user is now explicitly
                      // abandoning. Leaving it visible would be confusing
                      // when they type a new number.
                      setDuplicatePhone(null);
                    }}
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
          {step === 3 && featureToggles.registrationOpen && (
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
                {/* Duplicate-email warning. Renders inside the step-3
                    form (NOT a full-page redirect) when the backend
                    reports `field: "email"` on a 409. The user keeps
                    their name / password / referral intact and only
                    has to fix the email field — or pick "Use a
                    different email" below to wipe and retype it. */}
                {duplicateEmail && (
                  <div className="rounded-md border border-warning-300 bg-warning-50 p-3 text-sm dark:border-warning-500 dark:bg-warning-500/20">
                    <p className="font-semibold text-warning-800 dark:text-warning-100">
                      {t(
                        "এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট আছে",
                        "This email is already in use",
                      )}
                    </p>
                    <p className="mt-1 text-xs text-warning-700 dark:text-warning-100">
                      {t(
                        `${duplicateEmail} ইমেইল দিয়ে একটি অ্যাকাউন্ট ইতিমধ্যে আছে। অন্য ইমেইল দিন অথবা ফাঁকা রাখুন — ইমেইল ঐচ্ছিক।`,
                        `An account already exists for ${duplicateEmail}. Use a different email or leave it empty — email is optional.`,
                      )}
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          // Clear the warning + the email field so they
                          // can retype (or submit empty). Name / password
                          // / referral stay so they don't lose progress.
                          setDuplicateEmail(null);
                          detailsForm.setValue("email", "", { shouldValidate: false });
                          // Move focus to the now-empty email input.
                          const el = document.getElementById(
                            "register-details-email",
                          ) as HTMLInputElement | null;
                          if (el) el.focus();
                        }}
                      >
                        {t("অন্য ইমেইল দিন", "Use a different email")}
                      </Button>
                    </div>
                  </div>
                )}
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

              {!setupMode && featureToggles.enableReferrals && (
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
  // Prefer the full display name so the user sees "Invited by Md Kamal
  // Hosen" rather than just "Invited by Md". Fall back to the legacy
  // first-name field for older backend responses.
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