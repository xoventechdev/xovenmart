"use client";

import Link from "next/link";
import { Mail, MessageSquare, Bell, ChevronRight, Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/lib/theme";

const CHANNELS = [
  { key: "email", href: "/admin/templates/email", icon: Mail, bn: "ইমেইল টেমপ্লেট", en: "Email Templates", descBn: "ইমেইল টেমপ্লেট সম্পাদনা করুন", descEn: "Edit email notification templates" },
  { key: "sms", href: "/admin/templates/sms", icon: MessageSquare, bn: "SMS টেমপ্লেট", en: "SMS Templates", descBn: "SMS টেমপ্লেট সম্পাদনা করুন", descEn: "Edit SMS notification templates" },
  { key: "push", href: "/admin/templates/push", icon: Bell, bn: "পুশ টেমপ্লেট", en: "Push Templates", descBn: "পুশ নোটিফিকেশন টেমপ্লেট", descEn: "Edit push notification templates" },
];

export default function NotificationTemplatesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("নোটিফিকেশন টেমপ্লেট", "Notification Templates")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("ইমেইল, SMS ও পুশ নোটিফিকেশনের টেমপ্লেট দেখুন ও পরিচালনা করুন", "Browse and manage email, SMS, and push notification templates")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Construction className="h-4 w-4 text-accent-500" />
            {t("সারসংক্ষেপ", "Summary")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3">
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.key} href={c.href} className="flex items-center gap-3 rounded-md border border-ink-200 p-3 transition-colors hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink-900 dark:text-ink-900">{t(c.bn, c.en)}</div>
                  <div className="text-xs text-ink-500">{t(c.descBn, c.descEn)}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-400" />
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-ink-500">
        {t("সম্পূর্ণ টেমপ্লেট এডিটরের জন্য /admin/templates দেখুন।", "For full template editor, see /admin/templates.")}
      </p>
    </div>
  );
}
