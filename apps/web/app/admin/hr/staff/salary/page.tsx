"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, DollarSign, X, Save, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import { toast } from "sonner";

interface StaffSalaryRow {
  adminUserId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastPaidMonth: string | null;
  lastPaidAmount: number | null;
  lastPaidAt: string | null;
  notes: string | null;
}

export default function StaffSalaryPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "hr", "staff-salary"],
    queryFn: () => api.get("/admin/hr/staff-salary"),
  });

  const [paying, setPaying] = useState(false);

  const list: StaffSalaryRow[] = (rows ?? []) as any;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthPaidTotal = list.filter((r) => r.lastPaidAt && new Date(r.lastPaidAt) >= monthStart).reduce((s, r) => s + (r.lastPaidAmount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("স্টাফ বেতন", "Staff Salary")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("অ্যাডমিন ও ম্যানেজারদের মাসিক বেতন রেকর্ড", "Record monthly salaries for admins and managers")}</p>
        </div>
        <Button onClick={() => setPaying(true)}>
          <Plus className="h-4 w-4" /> {t("বেতন দিন", "Pay Salary")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-success-100 text-success-700">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="text-xl font-bold">{formatBDT(thisMonthPaidTotal)}</div>
            <div className="text-xs text-ink-500">{t("এই মাসে দেওয়া হয়েছে", "Paid This Month")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="text-xl font-bold">{list.length}</div>
            <div className="text-xs text-ink-500">{t("মোট স্টাফ", "Total Staff")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-info-100 text-info-700">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="text-xl font-bold">{list.filter((r) => r.isActive).length}</div>
            <div className="text-xs text-ink-500">{t("সক্রিয়", "Active")}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন স্টাফ নেই", "No staff yet")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-ink-200 dark:border-ink-300">
                <tr className="text-left text-xs text-ink-500">
                  <th className="p-2">{t("নাম", "Name")}</th>
                  <th className="p-2">{t("ভূমিকা", "Role")}</th>
                  <th className="p-2">{t("শেষ বেতন মাস", "Last Paid Month")}</th>
                  <th className="p-2">{t("শেষ পরিমাণ", "Last Amount")}</th>
                  <th className="p-2">{t("সক্রিয়", "Active")}</th>
                  <th className="p-2">{t("অ্যাকশন", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.adminUserId} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-200">
                    <td className="p-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-ink-500">{r.email}</div>
                    </td>
                    <td className="p-2"><Badge variant={r.role === "ADMIN" ? "accent" : "info"}>{r.role}</Badge></td>
                    <td className="p-2">{r.lastPaidMonth ?? "—"}</td>
                    <td className="p-2 font-semibold">{r.lastPaidAmount != null ? formatBDT(r.lastPaidAmount) : "—"}</td>
                    <td className="p-2"><Badge variant={r.isActive ? "success" : "muted"}>{r.isActive ? t("হ্যাঁ", "Yes") : t("না", "No")}</Badge></td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" onClick={() => setPaying(true)}>
                        <DollarSign className="h-3 w-3" /> {t("দিন", "Pay")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {paying && <PaySalaryModal staff={list} onClose={() => setPaying(false)} />}
    </div>
  );
}

function PaySalaryModal({ staff, onClose }: { staff: StaffSalaryRow[]; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [form, setForm] = useState({ adminUserId: "", month: defaultMonth, amount: 0, notes: "" });

  const save = useMutation({
    mutationFn: () => api.post("/admin/hr/staff-salary/pay", form),
    onSuccess: () => {
      toast.success(t("বেতন রেকর্ড হয়েছে", "Salary recorded"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "staff-salary"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 font-semibold"><DollarSign className="h-4 w-4" /> {t("বেতন দিন", "Pay Salary")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <Field label={t("স্টাফ", "Staff")}>
            <select value={form.adminUserId} onChange={(e) => setForm((s) => ({ ...s, adminUserId: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("— নির্বাচন করুন —", "— Select staff —")}</option>
              {staff.map((s) => <option key={s.adminUserId} value={s.adminUserId}>{s.name} ({s.role})</option>)}
            </select>
          </Field>
          <Field label={t("মাস (YYYY-MM)", "Month (YYYY-MM)")}>
            <Input value={form.month} onChange={(e) => setForm((s) => ({ ...s, month: e.target.value }))} placeholder="2026-08" />
          </Field>
          <Field label={t("পরিমাণ (BDT)", "Amount (BDT)")}>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value) }))} />
          </Field>
          <Field label={t("নোট", "Notes")}>
            <Input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} placeholder={t("ঐচ্ছিক", "Optional")} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.adminUserId || form.amount <= 0}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("দিন", "Pay")}
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