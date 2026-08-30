"use client";

import { Plus, Package, ArrowRight, AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export default function AdjustStockPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("স্টক অ্যাডজাস্ট", "Adjust Stock")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("স্টক সমন্বয় করার নির্দেশাবলী", "Instructions for adjusting stock")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("কিভাবে স্টক অ্যাডজাস্ট করবেন", "How to adjust stock")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 text-sm">
          <p className="text-ink-700 dark:text-ink-900">
            {t(
              "স্টক অ্যাডজাস্টমেন্ট সরাসরি ইনভেন্টরি পেজ থেকে করা হয়। নিচের যেকোনো বিকল্প ব্যবহার করুন:",
              "Stock adjustments are made directly from the Inventory page. Use any of the options below:",
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/admin/inventory" className="block">
              <div className="rounded-md border border-ink-200 p-4 transition-colors hover:border-primary-700 hover:bg-primary-50 dark:border-ink-300 dark:hover:bg-primary-100">
                <div className="flex items-center gap-2 font-semibold">
                  <Plus className="h-4 w-4 text-primary-700" />
                  {t("ইনভেন্টরি পেজে যান", "Go to Inventory page")}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {t("প্রধান ইনভেন্টরি পেজে \"Adjust Stock\" বোতাম ব্যবহার করুন", "Use the \"Adjust Stock\" button on the main Inventory page")}
                </p>
              </div>
            </Link>
            <Link href="/admin/inventory/low-stock" className="block">
              <div className="rounded-md border border-ink-200 p-4 transition-colors hover:border-warning-700 hover:bg-warning-50 dark:border-ink-300 dark:hover:bg-warning-100">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-warning-700" />
                  {t("কম স্টক থেকে", "From Low Stock page")}
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {t("কম স্টক পেজেও একই বোতাম আছে", "Same button is also available on the Low Stock page")}
                </p>
              </div>
            </Link>
          </div>

          <div className="rounded-md bg-primary-50 p-3 text-xs dark:bg-primary-100">
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 h-4 w-4 text-primary-700" />
              <div className="text-ink-700 dark:text-ink-900">
                <div className="font-semibold">{t("কারণসমূহ", "Reasons")}</div>
                <div className="mt-1 text-ink-500">
                  {t(
                    "PURCHASE, SALE, ADJUSTMENT, RETURN, DAMAGE, EXPIRED — সব মুভমেন্ট স্টক মুভমেন্ট ইতিহাসে সংরক্ষিত হয়।",
                    "PURCHASE, SALE, ADJUSTMENT, RETURN, DAMAGE, EXPIRED — every movement is recorded in the stock movement history.",
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md bg-warning-50 p-3 text-xs dark:bg-warning-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning-700" />
              <div className="text-ink-700 dark:text-ink-900">
                <div className="font-semibold">{t("নোট", "Note")}</div>
                <div className="mt-1 text-ink-500">
                  {t(
                    "স্টক অ্যাডজাস্টমেন্ট শুধুমাত্র ADMIN রোলের জন্য। MANAGER রোল ব্যবহারকারীরা দেখতে পারবেন কিন্তু অ্যাডজাস্ট করতে পারবেন না।",
                    "Stock adjustments are ADMIN role only. MANAGER role users can view but not adjust.",
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Link href="/admin/inventory">
        <Button>
          <ArrowRight className="h-4 w-4" /> {t("ইনভেন্টরিতে যান", "Open Inventory")}
        </Button>
      </Link>

      <Link href="/admin/inventory/movements" className="ml-2 inline-block">
        <Button variant="outline">
          <TrendingUp className="h-4 w-4" /> {t("মুভমেন্ট দেখুন", "View Movements")}
        </Button>
      </Link>
    </div>
  );
}