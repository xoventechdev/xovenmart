"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, DollarSign, Trash2, Pencil, X, Save, Wallet, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import { toast } from "sonner";

interface Payout {
  id: string;
  riderId: string;
  riderName: string | null;
  riderPhone: string | null;
  periodStart: string;
  periodEnd: string;
  deliveriesCount: number;
  baseSalary: number;
  commissionTotal: number;
  bonusesTotal: number;
  advancesTotal: number;
  deductionsTotal: number;
  cashCollectedTotal: number;
  netPayable: number;
  status: "DRAFT" | "APPROVED" | "PAID" | "CANCELLED";
  paidAt?: string | null;
  paidVia?: string | null;
  paidRef?: string | null;
  notes?: string | null;
}

interface Rider {
  id: string;
  name: string;
  phone: string;
}

const STATUS_MAP: Record<string, { bn: string; en: string; variant: any }> = {
  DRAFT: { bn: "ড্রাফট", en: "Draft", variant: "muted" },
  APPROVED: { bn: "অনুমোদিত", en: "Approved", variant: "info" },
  PAID: { bn: "পরিশোধিত", en: "Paid", variant: "success" },
  CANCELLED: { bn: "বাতিল", en: "Cancelled", variant: "danger" },
};

export default function RiderPayoutsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [riderFilter, setRiderFilter] = useState<string>("");
  const [calculating, setCalculating] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: payouts, isLoading } = useQuery({
    queryKey: ["admin", "hr", "payouts", statusFilter, riderFilter],
    queryFn: () => {
      const q: string[] = [];
      if (statusFilter) q.push(`status=${statusFilter}`);
      if (riderFilter) q.push(`riderId=${riderFilter}`);
      return api.get(`/admin/hr/payouts${q.length ? "?" + q.join("&") : ""}`);
    },
  });

  const { data: riders } = useQuery({
    queryKey: ["admin", "riders", "active-list"],
    queryFn: () => api.get("/admin/riders/active/list"),
  });

  const { data: summary } = useQuery({
    queryKey: ["admin", "hr", "payouts-summary"],
    queryFn: () => api.get("/admin/hr/payouts"),
  });

  const ridersList: Rider[] = (riders ?? []) as any;
  const list: Payout[] = (payouts ?? []) as any;
  const all: Payout[] = (summary ?? []) as any;

  // Stats
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  const thisMonthPaid = all
    .filter((p) => p.status === "PAID" && p.paidAt && new Date(p.paidAt) >= monthStart)
    .reduce((s, p) => s + p.netPayable, 0);
  const pending = all
    .filter((p) => p.status === "APPROVED")
    .reduce((s, p) => s + p.netPayable, 0);
  const drafts = all.filter((p) => p.status === "DRAFT").length;
  const totalYTD = all
    .filter((p) => p.status === "PAID" && p.paidAt && new Date(p.paidAt) >= ytdStart)
    .reduce((s, p) => s + p.netPayable, 0);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/hr/payouts/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "payouts"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/hr/payouts/${id}/approve`, {}),
    onSuccess: () => {
      toast.success(t("অনুমোদিত", "Approved"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "payouts"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Approve failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("রাইডার পেমেন্ট", "Rider Payouts")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("রাইডারদের বেতন হিসাব, অনুমোদন ও পরিশোধ", "Calculate, approve and pay rider salaries")}</p>
        </div>
        <Button onClick={() => setCalculating(true)}>
          <Plus className="h-4 w-4" /> {t("হিসাব করুন", "Calculate")}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label={t("এই মাসে পরিশোধিত", "Paid This Month")} value={formatBDT(thisMonthPaid)} color="bg-success-100 text-success-700" />
        <StatCard label={t("অনুমোদিত (অপেক্ষমান)", "Approved (Pending)")} value={formatBDT(pending)} color="bg-info-100 text-info-700" />
        <StatCard label={t("ড্রাফট", "Drafts")} value={String(drafts)} color="bg-warning-100 text-warning-700" />
        <StatCard label={t("চলতি বছরে মোট", "Total YTD")} value={formatBDT(totalYTD)} color="bg-primary-100 text-primary-700" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-ink-500">{t("স্ট্যাটাস", "Status")}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                <option value="">{t("সব", "All")}</option>
                <option value="DRAFT">DRAFT</option>
                <option value="APPROVED">APPROVED</option>
                <option value="PAID">PAID</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-500">{t("রাইডার", "Rider")}</label>
              <select
                value={riderFilter}
                onChange={(e) => setRiderFilter(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
              >
                <option value="">{t("সব", "All")}</option>
                {ridersList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন পেমেন্ট নেই", "No payouts yet")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-ink-200 dark:border-ink-300">
                <tr className="text-left text-xs text-ink-500">
                  <th className="p-2">{t("রাইডার", "Rider")}</th>
                  <th className="p-2">{t("সময়কাল", "Period")}</th>
                  <th className="p-2">{t("ডেলিভারি", "Deliv.")}</th>
                  <th className="p-2">{t("কমিশন", "Commission")}</th>
                  <th className="p-2">{t("অগ্রিম", "Adv.")}</th>
                  <th className="p-2">{t("নেট", "Net")}</th>
                  <th className="p-2">{t("স্ট্যাটাস", "Status")}</th>
                  <th className="p-2">{t("অ্যাকশন", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const s = STATUS_MAP[p.status] ?? { bn: p.status, en: p.status, variant: "muted" };
                  return (
                    <tr key={p.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-200">
                      <td className="p-2 font-medium">{p.riderName ?? "—"}</td>
                      <td className="p-2 text-xs">
                        {new Date(p.periodStart).toLocaleDateString()} —<br />
                        {new Date(p.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="p-2">{p.deliveriesCount}</td>
                      <td className="p-2">{formatBDT(p.commissionTotal)}</td>
                      <td className="p-2 text-warning-700">{formatBDT(p.advancesTotal)}</td>
                      <td className="p-2 font-semibold">{formatBDT(p.netPayable)}</td>
                      <td className="p-2"><Badge variant={s.variant}>{lang === "bn" ? s.bn : s.en}</Badge></td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          {p.status === "DRAFT" && (
                            <Button size="icon" variant="ghost" title={t("অনুমোদন", "Approve")} onClick={() => approve.mutate(p.id)}>
                              <Check className="h-4 w-4 text-success-700" />
                            </Button>
                          )}
                          {p.status === "DRAFT" && (
                            <Button size="icon" variant="ghost" title={t("সম্পাদনা", "Edit")} onClick={() => setEditingId(p.id)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {p.status === "APPROVED" && (
                            <Button size="icon" variant="ghost" title={t("পরিশোধ", "Pay")} onClick={() => setPayingId(p.id)}>
                              <DollarSign className="h-4 w-4 text-success-700" />
                            </Button>
                          )}
                          {(p.status === "DRAFT" || p.status === "CANCELLED") && (
                            <Button size="icon" variant="ghost" title={t("মুছুন", "Delete")} onClick={() => { if (confirm(t("মুছবেন?", "Delete?"))) remove.mutate(p.id); }}>
                              <Trash2 className="h-4 w-4 text-danger-700" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {calculating && (
        <CalculatePayoutModal riders={ridersList} onClose={() => setCalculating(false)} />
      )}
      {payingId && (
        <PayPayoutModal payoutId={payingId} onClose={() => setPayingId(null)} />
      )}
      {editingId && (
        <EditPayoutModal payoutId={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
          <Wallet className="h-4 w-4" />
        </div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-ink-500">{label}</div>
      </CardContent>
    </Card>
  );
}

function CalculatePayoutModal({ riders, onClose }: { riders: Rider[]; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    riderId: "",
    periodStart: firstOfMonth,
    periodEnd: today,
  });

  const save = useMutation({
    mutationFn: () => api.post("/admin/hr/payouts/calculate", form),
    onSuccess: () => {
      toast.success(t("হিসাব তৈরি হয়েছে", "Payout calculated"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "payouts"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Calculate failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 font-semibold"><Calculator className="h-4 w-4" /> {t("পেমেন্ট হিসাব", "Calculate Payout")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <Field label={t("রাইডার", "Rider")}>
            <select value={form.riderId} onChange={(e) => setForm((s) => ({ ...s, riderId: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("— নির্বাচন করুন —", "— Select rider —")}</option>
              {riders.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.phone})</option>)}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("শুরু", "Start")}>
              <Input type="date" value={form.periodStart} onChange={(e) => setForm((s) => ({ ...s, periodStart: e.target.value }))} />
            </Field>
            <Field label={t("শেষ", "End")}>
              <Input type="date" value={form.periodEnd} onChange={(e) => setForm((s) => ({ ...s, periodEnd: e.target.value }))} />
            </Field>
          </div>
          <p className="text-xs text-ink-500">{t("স্বয়ংক্রিয়ভাবে ডেলিভারি, ক্যাশ ও অগ্রিম গণনা করা হবে", "Deliveries, cash and advances will be calculated automatically")}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.riderId}>
            <Save className="h-4 w-4" /> {save.isPending ? t("হিসাব হচ্ছে...", "Calculating...") : t("হিসাব করুন", "Calculate")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PayPayoutModal({ payoutId, onClose }: { payoutId: string; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [form, setForm] = useState({ paidVia: "CASH", paidRef: "" });

  const save = useMutation({
    mutationFn: () => api.post(`/admin/hr/payouts/${payoutId}/pay`, form),
    onSuccess: () => {
      toast.success(t("পরিশোধিত", "Paid"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "payouts"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Payment failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 font-semibold"><DollarSign className="h-4 w-4" /> {t("পরিশোধ করুন", "Mark Paid")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <Field label={t("পদ্ধতি", "Method")}>
            <select value={form.paidVia} onChange={(e) => setForm((s) => ({ ...s, paidVia: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="CASH">{t("ক্যাশ", "CASH")}</option>
              <option value="BKASH">bKash</option>
              <option value="NAGAD">Nagad</option>
              <option value="BANK">{t("ব্যাংক", "BANK")}</option>
              <option value="CARD">{t("কার্ড", "CARD")}</option>
              <option value="OTHER">{t("অন্যান্য", "OTHER")}</option>
            </select>
          </Field>
          <Field label={t("রেফারেন্স (Trx ID / নোট)", "Reference (Trx ID / Note)")}>
            <Input value={form.paidRef} onChange={(e) => setForm((s) => ({ ...s, paidRef: e.target.value }))} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("পরিশোধ নিশ্চিত", "Confirm Payment")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditPayoutModal({ payoutId, onClose }: { payoutId: string; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: payout } = useQuery({
    queryKey: ["admin", "hr", "payout", payoutId],
    queryFn: () => api.get(`/admin/hr/payouts/${payoutId}`),
  });

  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (payout && !form) {
      setForm({
        baseSalary: Number(payout.baseSalary),
        commissionTotal: Number(payout.commissionTotal),
        bonusesTotal: Number(payout.bonusesTotal),
        advancesTotal: Number(payout.advancesTotal),
        deductionsTotal: Number(payout.deductionsTotal),
        notes: payout.notes ?? "",
      });
    }
  }, [payout, form]);

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/hr/payouts/${payoutId}`, form),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "payouts"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  if (!payout || !form) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white p-6 shadow-xl dark:bg-ink-50">
          <div className="h-8 w-32 animate-pulse rounded bg-ink-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 font-semibold"><Pencil className="h-4 w-4" /> {t("পেমেন্ট সম্পাদনা", "Edit Payout")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("বেস বেতন", "Base Salary")}>
              <Input type="number" step="0.01" value={form.baseSalary} onChange={(e) => setForm((s: any) => ({ ...s, baseSalary: Number(e.target.value) }))} />
            </Field>
            <Field label={t("কমিশন", "Commission")}>
              <Input type="number" step="0.01" value={form.commissionTotal} onChange={(e) => setForm((s: any) => ({ ...s, commissionTotal: Number(e.target.value) }))} />
            </Field>
            <Field label={t("বোনাস", "Bonuses")}>
              <Input type="number" step="0.01" value={form.bonusesTotal} onChange={(e) => setForm((s: any) => ({ ...s, bonusesTotal: Number(e.target.value) }))} />
            </Field>
            <Field label={t("অগ্রিম", "Advances")}>
              <Input type="number" step="0.01" value={form.advancesTotal} onChange={(e) => setForm((s: any) => ({ ...s, advancesTotal: Number(e.target.value) }))} />
            </Field>
            <Field label={t("কর্তন", "Deductions")}>
              <Input type="number" step="0.01" value={form.deductionsTotal} onChange={(e) => setForm((s: any) => ({ ...s, deductionsTotal: Number(e.target.value) }))} />
            </Field>
          </div>
          <Field label={t("নোট", "Notes")}>
            <Input value={form.notes} onChange={(e) => setForm((s: any) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}