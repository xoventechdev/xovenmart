"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Save,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  Phone,
  User as UserIcon,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { relativeTime } from "@/lib/utils";

/**
 * /admin/profile — staff self-service.
 *
 * Lets any logged-in admin/manager update their own name + phone and
 * change their password. Email and role are read-only here (email change
 * requires admin approval; role change must go through HR).
 *
 * Data sources:
 *   GET  /admin/me                 → load current profile
 *   PATCH /admin/me                → save name + phone
 *   POST /admin/me/change-password → rotate password (revokes all refresh tokens)
 *
 * Bilingual BN/EN via `useTheme().lang`.
 */

const profileSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  phone: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^[+0-9\s\-()]{6,20}$/.test(v),
      { message: "Enter a valid phone number" },
    ),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: "Enter your current password" }),
    newPassword: z.string().min(8, { message: "Password must be at least 8 characters" }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "New password must differ from the current one",
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

const ROLE_LABELS: Record<string, { bn: string; en: string; cls: string }> = {
  ADMIN:   { bn: "👑 অ্যাডমিন", en: "👑 Admin", cls: "bg-primary-100 text-primary-700" },
  MANAGER: { bn: "🔧 ম্যানেজার", en: "🔧 Manager", cls: "bg-info-100 text-info-700" },
};

export default function StaffProfilePage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [me, setMe] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form ───────────────────────────────
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", phone: "" },
  });

  // Password form (with show/hide toggles) ──────
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCon, setShowCon] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await api.get("/admin/me");
        setMe(res.admin);
        profileForm.reset({
          name: res.admin.name ?? "",
          phone: res.admin.phone ?? "",
        });
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? String(e.data?.message ?? e.message ?? "")
            : "Could not load profile";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onProfileSubmit(values: ProfileForm) {
    try {
      const res: any = await api.patch("/admin/me", {
        name: values.name.trim(),
        phone: values.phone?.trim() ? values.phone.trim() : null,
      });
      setMe(res.admin);
      toast.success(t("প্রোফাইল আপডেট হয়েছে", "Profile updated"));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? String(e.data?.message ?? e.message ?? "")
          : "Could not update profile";
      toast.error(msg);
    }
  }

  async function onPasswordSubmit(values: PasswordForm) {
    try {
      await api.post("/admin/me/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Server revokes all refresh tokens; refresh the page so the next
      // request triggers a re-login flow on the current tab.
      toast.success(
        t(
          "পাসওয়ার্ড পরিবর্তন হয়েছে — অনুগ্রহ করে আবার লগইন করুন",
          "Password changed — please sign in again",
        ),
      );
      passwordForm.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
      // Auto-logout after a short pause so the toast is visible
      setTimeout(() => {
        api.clearTokens();
        window.location.href = "/admin/login";
      }, 1800);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? String(e.data?.message ?? e.message ?? "")
          : "Could not change password";
      toast.error(msg);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-700 border-t-transparent" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="rounded-lg border border-danger-300 bg-danger-50 p-4 text-sm text-danger-700">
        {t("প্রোফাইল লোড করা যায়নি", "Could not load profile")}
      </div>
    );
  }

  const roleMeta = ROLE_LABELS[me.role] ?? { bn: me.role, en: me.role, cls: "bg-ink-100 text-ink-700" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("আমার প্রোফাইল ও সেটিংস", "My Profile & Settings")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t(
            "আপনার নাম, ফোন নম্বর ও পাসওয়ার্ড আপডেট করুন",
            "Update your name, phone number, and password",
          )}
        </p>
      </div>

      {/* Read-only summary card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white ${
                me.role === "ADMIN" ? "bg-primary-700" : "bg-info-700"
              }`}
            >
              {(me.name ?? "?")[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-lg font-bold text-ink-900 dark:text-ink-900">
                  {me.name}
                </div>
                <Badge variant={me.isActive ? "success" : "danger"}>
                  {me.isActive ? (
                    <>
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      {t("সক্রিয়", "Active")}
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-1 h-3 w-3" />
                      {t("নিষ্ক্রিয়", "Inactive")}
                    </>
                  )}
                </Badge>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${roleMeta.cls}`}>
                  {lang === "bn" ? roleMeta.bn : roleMeta.en}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm text-ink-600 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-ink-400" />
                  <span className="truncate">{me.email}</span>
                </div>
                {me.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-ink-400" />
                    <span>{me.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-ink-400" />
                  <span className="text-xs">
                    {t("শেষ লগইন:", "Last login:")}{" "}
                    <strong>{me.lastLoginAt ? relativeTime(me.lastLoginAt, lang) : "—"}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-ink-400" />
                  <span className="text-xs">
                    {t("অ্যাকাউন্ট তৈরি:", "Joined:")}{" "}
                    <strong>{new Date(me.createdAt).toLocaleDateString(lang === "bn" ? "en-US" : "en-US")}</strong>
                  </span>
                </div>
              </div>
              {me.email && (
                <div className="rounded-md bg-ink-100 px-3 py-1.5 text-xs text-ink-500 dark:bg-ink-200">
                  <Lock className="mr-1 inline h-3 w-3" />
                  {t(
                    "ইমেইল পরিবর্তন করতে অ্যাডমিনের সাথে যোগাযোগ করুন",
                    "Contact an administrator to change your email",
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            {t("প্রোফাইল তথ্য", "Profile Details")}
          </CardTitle>
          <CardDescription>
            {t("আপনার নাম ও ফোন নম্বর আপডেট করুন", "Update your display name and phone number")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ফুল নাম", "Full name")}
              </label>
              <Input
                type="text"
                placeholder={t("আপনার নাম", "Your name")}
                autoComplete="name"
                {...profileForm.register("name")}
              />
              {profileForm.formState.errors.name && (
                <p className="text-xs text-danger-500">
                  {profileForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ফোন নম্বর", "Phone number")}
              </label>
              <Input
                type="tel"
                placeholder="+8801XXXXXXXXX"
                autoComplete="tel"
                {...profileForm.register("phone")}
              />
              <p className="text-xs text-ink-500">
                {t(
                  "ঐচ্ছিক — ফাঁকা রাখলে ফোন মুছে যাবে",
                  "Optional — leave blank to clear",
                )}
              </p>
              {profileForm.formState.errors.phone && (
                <p className="text-xs text-danger-500">
                  {profileForm.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ইমেইল (পড়ার জন্য)", "Email (read-only)")}
              </label>
              <Input value={me.email} disabled readOnly />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("ভূমিকা (পড়ার জন্য)", "Role (read-only)")}
              </label>
              <Input value={lang === "bn" ? roleMeta.bn : roleMeta.en} disabled readOnly />
            </div>

            <Button type="submit" disabled={profileForm.formState.isSubmitting}>
              {profileForm.formState.isSubmitting ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t("সেভ করুন", "Save changes")}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {t("পাসওয়ার্ড পরিবর্তন", "Change Password")}
          </CardTitle>
          <CardDescription>
            {t(
              "অন্তত ৮ অক্ষরের একটি শক্তিশালী পাসওয়ার্ড ব্যবহার করুন। পরিবর্তনের পর অন্য ডিভাইস থেকে লগইন আবার করতে হবে।",
              "Use a strong password of at least 8 characters. After changing it, you'll need to sign in again on other devices.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("বর্তমান পাসওয়ার্ড", "Current password")}
              </label>
              <div className="relative">
                <Input
                  type={showCur ? "text" : "password"}
                  autoComplete="current-password"
                  {...passwordForm.register("currentPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowCur(!showCur)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-200"
                  aria-label="toggle current password visibility"
                >
                  {showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-danger-500">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("নতুন পাসওয়ার্ড", "New password")}
              </label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  {...passwordForm.register("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-200"
                  aria-label="toggle new password visibility"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-ink-500">{t("কমপক্ষে ৮ অক্ষর", "At least 8 characters")}</p>
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-danger-500">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("নতুন পাসওয়ার্ড নিশ্চিত করুন", "Confirm new password")}
              </label>
              <div className="relative">
                <Input
                  type={showCon ? "text" : "password"}
                  autoComplete="new-password"
                  {...passwordForm.register("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowCon(!showCon)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-200"
                  aria-label="toggle confirm password visibility"
                >
                  {showCon ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-danger-500">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
              {passwordForm.formState.isSubmitting ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  {t("পাসওয়ার্ড পরিবর্তন করুন", "Change password")}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
