"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, X, Save, Ticket, Trash2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Campaign {
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
  issuer?: string;
  usedCount: number;
  usageLimit?: number | null;
  _count?: { orders: number; products: number; categories: number };
}

function typeVariant(t: string): "default" | "warning" | "success" | "info" {
  if (t === "PERCENT") return "info";
  if (t === "FLAT") return "warning";
  if (t === "FREE_DELIVERY") return "success";
  return "default";
}

function discountValue(d: Campaign): string {
  const v = Number(d.value);
  if (d.type === "PERCENT") return `${v}%`;
  if (d.type === "FLAT") return `৳${v.toLocaleString()}`;
  return "Free";
}

function isActiveNow(c: Campaign): boolean {
  const now = Date.now();
  const start = new Date(c.startsAt).getTime();
  const end = new Date(c.endsAt).getTime();
  return c.isActive && start <= now && end >= now;
}

export default function CampaignsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["admin", "marketing", "campaigns"],
    queryFn: () => api.get("/admin/marketing/campaigns"),
  });

  const list: Campaign[] = (campaigns ?? []) as any;

  const filtered = list.filter((c) => {
    if (filterStatus === "active" && !isActiveNow(c)) return false;
    if (filterStatus === "inactive" && isActiveNow(c)) return false;
    if (filterStatus === "expired" && new Date(c.endsAt).getTime() >= Date.now()) return false;
    if (fromDate && new Date(c.startsAt) < new Date(fromDate)) return false;
    if (toDate && new Date(c.endsAt) > new Date(toDate + "T23:59:59")) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("ক্যাম্পেইন", "Campaigns")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("সব প্রচারমূলক ক্যাম্পেইন দেখুন ও পরিচালনা করুন", "View and manage all promotional campaigns")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন ক্যাম্পেইন", "New Campaign")}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("স্ট্যাটাস", "Status")}</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("সব", "All")}</option>
              <option value="active">{t("সক্রিয়", "Active")}</option>
              <option value="inactive">{t("নিষ্ক্রিয়", "Inactive")}</option>
              <option value="expired">{t("মেয়াদোত্তীর্ণ", "Expired")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("থেকে", "From")}</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("পর্যন্ত", "To")}</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" /> {t("ক্যাম্পেইন", "Campaigns")} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন ক্যাম্পেইন নেই", "No campaigns")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                    <th className="px-2 py-2">{t("কোড", "Code")}</th>
                    <th className="px-2 py-2">{t("ধরন", "Type")}</th>
                    <th className="px-2 py-2">{t("মান", "Value")}</th>
                    <th className="px-2 py-2">{t("স্কোপ", "Scope")}</th>
                    <th className="px-2 py-2">{t("শুরু", "Starts")}</th>
                    <th className="px-2 py-2">{t("শেষ", "Ends")}</th>
                    <th className="px-2 py-2">{t("ব্যবহৃত", "Used")}</th>
                    <th className="px-2 py-2">{t("স্ট্যাটাস", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100">
                      <td className="px-2 py-2 font-mono text-xs">{c.code}</td>
                      <td className="px-2 py-2"><Badge variant={typeVariant(c.type)}>{c.type}</Badge></td>
                      <td className="px-2 py-2 font-semibold">{discountValue(c)}</td>
                      <td className="px-2 py-2 text-xs">{c.scope}</td>
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(c.startsAt).toLocaleDateString()}</td>
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(c.endsAt).toLocaleDateString()}</td>
                      <td className="px-2 py-2 text-xs">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                      <td className="px-2 py-2"><Badge variant={isActiveNow(c) ? "success" : "muted"}>{isActiveNow(c) ? t("সক্রিয়", "Active") : t("নিষ্ক্রিয়", "Inactive")}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <CampaignDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function CampaignDialog({ onClose }: { onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    code: "",
    type: "PERCENT",
    value: 10,
    scope: "ALL",
    descriptionBn: "",
    descriptionEn: "",
    startsAt: today,
    endsAt: nextMonth,
    usageLimit: undefined as number | undefined,
    minOrder: 0,
  });

  const create = useMutation({
    mutationFn: () => api.post("/admin/marketing/campaigns", form),
    onSuccess: () => {
      toast.success(t("ক্যাম্পেইন তৈরি হয়েছে", "Campaign created"));
      qc.invalidateQueries({ queryKey: ["admin", "marketing"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Create failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 dark:border-ink-300 dark:bg-ink-50">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{t("নতুন ক্যাম্পেইন", "New Campaign")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("কোড", "Code")}</label>
              <Input value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))} placeholder="SUMMER20" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("ধরন", "Type")}</label>
              <select value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
                <option value="PERCENT">{t("শতাংশ", "Percent")}</option>
                <option value="FLAT">{t("ফ্ল্যাট", "Flat")}</option>
                <option value="FREE_DELIVERY">{t("ফ্রি ডেলিভারি", "Free Delivery")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("মান", "Value")} {form.type === "PERCENT" ? "(%)" : "(৳)"}</label>
              <Input type="number" value={form.value} onChange={(e) => setForm((s) => ({ ...s, value: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("স্কোপ", "Scope")}</label>
              <select value={form.scope} onChange={(e) => setForm((s) => ({ ...s, scope: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
                <option value="ALL">All</option>
                <option value="SPECIFIC_PRODUCTS">Specific products</option>
                <option value="SPECIFIC_CATEGORIES">Specific categories</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("শুরু", "Starts At")}</label>
              <Input type="date" value={form.startsAt} onChange={(e) => setForm((s) => ({ ...s, startsAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("শেষ", "Ends At")}</label>
              <Input type="date" value={form.endsAt} onChange={(e) => setForm((s) => ({ ...s, endsAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("ব্যবহার সীমা", "Usage limit")}</label>
              <Input type="number" value={form.usageLimit ?? ""} onChange={(e) => setForm((s) => ({ ...s, usageLimit: e.target.value ? Number(e.target.value) : undefined }))} placeholder={t("আনলিমিটেড", "unlimited")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("ন্যূনতম অর্ডার", "Min order")}</label>
              <Input type="number" value={form.minOrder} onChange={(e) => setForm((s) => ({ ...s, minOrder: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">{t("বর্ণনা (বাংলা)", "Description (BN)")}</label>
              <Input value={form.descriptionBn} onChange={(e) => setForm((s) => ({ ...s, descriptionBn: e.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">{t("বর্ণনা (EN)", "Description (EN)")}</label>
              <Input value={form.descriptionEn} onChange={(e) => setForm((s) => ({ ...s, descriptionEn: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-200 bg-white p-3 dark:border-ink-300 dark:bg-ink-50">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.code}>
            <Save className="h-4 w-4" /> {create.isPending ? t("তৈরি হচ্ছে...", "Creating...") : t("তৈরি করুন", "Create")}
          </Button>
        </div>
      </div>
    </div>
  );
}