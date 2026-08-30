"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, DollarSign, X, Save, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import { toast } from "sonner";

interface Advance {
  id: string;
  riderId: string | null;
  riderName: string | null;
  riderPhone: string | null;
  adminUserId: string | null;
  amount: number;
  reason: string | null;
  givenAt: string;
  givenById: string;
  repaidAmount: number;
  repaidAt: string | null;
  status: "PENDING" | "PARTIAL" | "REPAID";
}

interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
}

const STATUS_MAP: Record<string, { bn: string; en: string; variant: any }> = {
  PENDING: { bn: "অপেক্ষমান", en: "Pending", variant: "warning" },
  PARTIAL: { bn: "আংশিক", en: "Partial", variant: "info" },
  REPAID: { bn: "পরিশোধিত", en: "Repaid", variant: "success" },
};

export default function StaffAdvancesPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [giving, setGiving] = useState(false);
  const [repaying, setRepaying] = useState<Advance | null>(null);

  const { data: allAdvances, isLoading } = useQuery({
    queryKey: ["admin", "hr", "advances", statusFilter],
    queryFn: () => api.get(`/admin/hr/advances${statusFilter ? "?status=" + statusFilter : ""}`),
  });

  // Only show advances that are for admin staff (no rider)
  const list: Advance[] = ((allAdvances ?? []) as any[]).filter((a) => a.adminUserId || !a.riderId);

  const pendingTotal = list.filter((a) => a.status === "PENDING" || a.status === "PARTIAL").reduce((s, a) => s + (a.amount - a.repaidAmount), 0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const repaidThisMonth = list.filter((a) => a.status === "REPAID" && a.repaidAt && new Date(a.repaidAt) >= monthStart).reduce((s, a) => s + a.repaidAmount, 0);
  const countPending = list.filter((a) => a.status === "PENDING" || a.status === "PARTIAL").length;

  const repay = useMutation({
    mutationFn: (vars: { id: string; amount: number }) => api.patch(`/admin/hr/advances/${vars.id}/repay`, { amount: vars.amount }),
    onSuccess: () => {
      toast.success(t("আপডেট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "advances"] });
      setRepaying(null);
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Repay failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("স্টাফ অগ্রিম", "Staff Advances")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("অ্যাডমিন/ম্যানেজারদের দেওয়া অগ্রিমের হিসাব", "Track advances given to admin/manager staff")}</p>
        </div>
        <Button onClick={() => setGiving(true)}>
          <Plus className="h-4 w-4" /> {t("অগ্রিম দিন", "Give Advance")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatCard label={t("মোট অপেক্ষমান", "Pending Total")} value={formatBDT(pendingTotal)} color="bg-warning-100 text-warning-700" />
        <StatCard label={t("এই মাসে পরিশোধিত", "Repaid This Month")} value={formatBDT(repaidThisMonth)} color="bg-success-100 text-success-700" />
        <StatCard label={t("অপেক্ষমান সংখ্যা", "Pending Count")} value={String(countPending)} color="bg-info-100 text-info-700" />
      </div>

      <Card>
        <CardContent className="p-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
          >
            <option value="">{t("সব স্ট্যাটাস", "All statuses")}</option>
            <option value="PENDING">PENDING</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="REPAID">REPAID</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন স্টাফ অগ্রিম নেই", "No staff advances yet")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-ink-200 dark:border-ink-300">
                <tr className="text-left text-xs text-ink-500">
                  <th className="p-2">{t("স্টাফ", "Staff")}</th>
                  <th className="p-2">{t("পরিমাণ", "Amount")}</th>
                  <th className="p-2">{t("তারিখ", "Given")}</th>
                  <th className="p-2">{t("কারণ", "Reason")}</th>
                  <th className="p-2">{t("পরিশোধ", "Repaid")}</th>
                  <th className="p-2">{t("স্ট্যাটাস", "Status")}</th>
                  <th className="p-2">{t("অ্যাকশন", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const s = STATUS_MAP[a.status] ?? { bn: a.status, en: a.status, variant: "muted" };
                  return (
                    <tr key={a.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-200">
                      <td className="p-2 font-medium">{a.adminUserId ?? "—"}</td>
                      <td className="p-2 font-semibold">{formatBDT(a.amount)}</td>
                      <td className="p-2 text-xs">{new Date(a.givenAt).toLocaleDateString()}</td>
                      <td className="p-2 max-w-xs truncate">{a.reason ?? "—"}</td>
                      <td className="p-2 text-success-700">{formatBDT(a.repaidAmount)}</td>
                      <td className="p-2"><Badge variant={s.variant}>{lang === "bn" ? s.bn : s.en}</Badge></td>
                      <td className="p-2">
                        {a.status !== "REPAID" && (
                          <Button size="sm" variant="outline" onClick={() => setRepaying(a)}>
                            <DollarSign className="h-3 w-3" /> {t("পরিশোধ", "Repay")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {giving && <GiveStaffAdvanceModal onClose={() => setGiving(false)} />}
      {repaying && <RepayModal advance={repaying} onRepay={(amount) => repay.mutate({ id: repaying.id, amount })} pending={repay.isPending} onClose={() => setRepaying(null)} />}
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

function GiveStaffAdvanceModal({ onClose }: { onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [form, setForm] = useState({ adminUserId: "", amount: 0, reason: "" });

  // Fetch admin list via the staff-salary endpoint which lists admin users
  const { data: rows } = useQuery({
    queryKey: ["admin", "hr", "staff-salary"],
    queryFn: () => api.get("/admin/hr/staff-salary"),
  });
  const admins: Admin[] = ((rows ?? []) as any[]).map((r) => ({
    id: r.adminUserId,
    name: r.name,
    email: r.email,
    role: r.role,
  }));

  const save = useMutation({
    mutationFn: () => api.post("/admin/hr/advances", form),
    onSuccess: () => {
      toast.success(t("অগ্রিম দেওয়া হয়েছে", "Advance given"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "advances"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> {t("স্টাফকে অগ্রিম দিন", "Give Staff Advance")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <Field label={t("স্টাফ", "Staff")}>
            <select value={form.adminUserId} onChange={(e) => setForm((s) => ({ ...s, adminUserId: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("— নির্বাচন করুন —", "— Select staff —")}</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
            </select>
          </Field>
          <Field label={t("পরিমাণ (BDT)", "Amount (BDT)")}>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value) }))} />
          </Field>
          <Field label={t("কারণ", "Reason")}>
            <Input value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} placeholder={t("ঐচ্ছিক", "Optional")} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.adminUserId || form.amount <= 0}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("দিন", "Give")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RepayModal({ advance, onRepay, pending, onClose }: { advance: Advance; onRepay: (amount: number) => void; pending: boolean; onClose: () => void }) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const outstanding = advance.amount - advance.repaidAmount;
  const [amount, setAmount] = useState<number>(outstanding);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 font-semibold"><DollarSign className="h-4 w-4" /> {t("অগ্রিম পরিশোধ", "Repay Advance")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-ink-500">
            {t("মোট বকেয়া", "Outstanding")}: <span className="font-semibold text-ink-900 dark:text-ink-900">{formatBDT(outstanding)}</span>
          </p>
          <Field label={t("পরিশোধের পরিমাণ", "Repayment Amount")}>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => onRepay(amount)} disabled={pending || amount <= 0}>
            <Save className="h-4 w-4" /> {pending ? t("সংরক্ষণ...", "Saving...") : t("পরিশোধ নিশ্চিত", "Confirm")}
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