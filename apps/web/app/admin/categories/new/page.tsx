"use client";
import { useTheme } from "@/lib/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NewCategoryPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("নতুন ক্যাটাগরি", "Add Category")}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('"ক্যাটাগরি" পেজে গিয়ে "+ নতুন ক্যাটাগরি" বোতামে ক্লিক করুন', 'Use the "+ New Category" button on the Categories page')}</CardTitle>
          <CardDescription>{t("নতুন ক্যাটাগরি ট্রিতে যোগ করতে সেখানকার মডাল ব্যবহার করুন।", "Add new categories via the modal on the Categories page.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/categories" className="inline-flex items-center gap-1 text-sm text-primary-700 hover:underline">
            {t("ক্যাটাগরি পেজে যান", "Go to Categories")} <ArrowRight className="h-4 w-4" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
