"use client";

import Link from "next/link";
import { MessageSquare, ListChecks, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export default function SmsNotificationsPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("SMS লগ", "SMS Log")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("সব SMS নোটিফিকেশন লগ", "All SMS notification logs")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-warning-700" />
            {t("SMS লগ", "SMS Logs")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          <div className="rounded-md border border-dashed border-ink-200 p-6 text-center dark:border-ink-300">
            <ListChecks className="mx-auto h-8 w-8 text-ink-400" />
            <p className="mt-2 text-sm font-medium">{t("সব SMS দেখতে নিচের বোতামে ক্লিক করুন", "Click below to view all SMS notifications")}</p>
          </div>
          <Link href="/admin/notifications">
            <Button className="w-full" variant="outline">
              <ExternalLink className="h-4 w-4" /> {t("সব নোটিফিকেশন দেখুন", "View all notifications")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}