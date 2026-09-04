"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useFeatureToggles } from "@/lib/use-feature-toggles";
import { ApiError } from "@/lib/api";

const profileSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: "Enter a valid email" },
    ),
});

export default function AccountProfilePage() {
  const auth = useAuth();
  const { lang } = useTheme();
  const toggles = useFeatureToggles();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", email: "" },
  });

  // Seed the form from the loaded user exactly once.
  useEffect(() => {
    if (!auth.user) return;
    form.reset({
      name: auth.user.name ?? "",
      email: auth.user.email ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  async function onSubmit(values: z.infer<typeof profileSchema>) {
    try {
      await auth.updateProfile({
        name: values.name,
        email: values.email?.trim() ? values.email.trim() : null,
      });
      toast.success(t("প্রোফাইল আপডেট হয়েছে", "Profile updated"));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? String(e.data?.message ?? e.message ?? "")
          : "Could not update profile";
      toast.error(msg || t("আপডেট করা যায়নি", "Could not update profile"));
    }
  }

  if (!auth.user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("প্রোফাইল", "Profile")}</CardTitle>
        <CardDescription>
          {t(
            "আপনার নাম ও ইমেইল আপডে� করুন",
            "Update your name and email",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("মোবাইল নম্বর", "Phone number")}
            </label>
            <Input value={auth.user.phone} disabled readOnly />
            <p className="text-xs text-ink-500">
              {t(
                "ফোন নম্বর আপনার লগইন — পরিবর্তন করতে সা�োর্টে যোগাযোগ করুন",
                "Your phone is your login ID — contact support to change it",
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("আপনার নাম", "Your name")}
            </label>
            <Input
              type="text"
              placeholder={t("কামাল হোসেন", "Kamal Hosen")}
              autoComplete="name"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-danger-500">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
              {t("ইমেইল", "Email")}
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-xs text-danger-500">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Hidden when referrals are paused so the profile doesn't
              advertise a code the admin has turned off. The value
              itself stays on `auth.user.referralCode` — the user
              could still find it via the API; we're just not putting
              it on the UI. */}
          {toggles.enableReferrals && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
                {t("রেফারেল কোড", "Referral code")}
              </label>
              <Input value={auth.user.referralCode} disabled readOnly className="font-mono" />
              <p className="text-xs text-ink-500">
                {t(
                  "বন্ধুদের শেয়ার করুন — তারা অ্যাকাউন্ট তৈরি করলে আপনি পুরস্কার পাবেন",
                  "Share with friends — earn rewards when they sign up",
                )}
              </p>
            </div>
          )}

          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
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
  );
}
