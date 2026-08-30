"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag, Plus, Pencil, Trash2, X, Save, Ticket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Discount {
  id: string;
  code: string;
  type: string;
  value: number | string;
  scope: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
  descriptionBn?: string | null;
  descriptionEn?: string | null;
  usageLimit?: number | null;
  usedCount: number;
}

function typeVariant(t: string): "default" | "warning" | "success" | "info" {
  if (t === "PERCENT") return "info";
  if (t === "FLAT") return "warning";
  if (t === "FREE_DELIVERY") return "success";
  return "default";
}

function discountValue(d: Discount, t: (bn: string, en: string) => string): string {
  const v = Number(d.value);
  if (d.type === "PERCENT") return `${v}%`;
  if (d.type === "FLAT") return `৳${v.toLocaleString()}`;
  return t("ফ্রি ডেলিভারি", "Free delivery");
}

export default function DealsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: deals, isLoading } = useQuery({
    queryKey: ["admin", "marketing", "deals"],
    queryFn: () => api.get("/admin/marketing/deals"),
  });

  const list: Discount[] = (deals ?? []) as any;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("সক্রিয় ডিল", "Active Deals")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("বর্তমানে চলমান সব প্রমোশন", "All currently-running promotions")}</p>
        </div>
        <a href="/admin/marketing/campaigns"><Button variant="outline"><Plus className="h-4 w-4" /> {t("নতুন ডিল", "New Deal")}</Button></a>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-500">
            <Tag className="mx-auto h-8 w-8 text-ink-400" />
            <p className="mt-2">{t("কোন সক্রিয় ডিল নেই", "No active deals")}</p>
            <p className="mt-1 text-xs">{t("একটি ক্যাম্পেইন তৈরি করুন যার তারিখ এখন সক্রিয়।", "Create a campaign with active dates to populate this page.")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Card key={d.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-accent-100 text-accent-700">
                    <Ticket className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-bold">{d.code}</div>
                    <div className="text-xs text-ink-500">{t(d.descriptionBn ?? "", d.descriptionEn ?? "")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={typeVariant(d.type)}>{discountValue(d, t)}</Badge>
                  <Badge variant="muted">{d.scope}</Badge>
                </div>
                <div className="text-xs text-ink-500">
                  {new Date(d.startsAt).toLocaleDateString()} — {new Date(d.endsAt).toLocaleDateString()}
                </div>
                <div className="text-xs text-ink-500">
                  {t("ব্যবহৃত:", "Used:")} {d.usedCount}{d.usageLimit ? ` / ${d.usageLimit}` : ""}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
