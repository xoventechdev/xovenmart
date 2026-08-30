"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, X, Save, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import { toast } from "sonner";

interface PayrollConfig {
  id: string | null;
  riderId: string | null;
  riderName: string | null;
  baseSalary: number;
  perDeliveryRate: number;
  codCommissionPercent: number;
  maxAdvance: number;
  isActive: boolean;
}

interface Rider {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
}

export default function RiderSalaryPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [editing, setEditing] = useState<PayrollConfig | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: configs, isLoading } = useQuery({
    queryKey: ["admin", "hr", "payroll-configs"],
    queryFn: () => api.get("/admin/hr/payroll-configs"),
  });

  const { data: riders } = useQuery({
    queryKey: ["admin", "riders", "active-list"],
    queryFn: () => api.get("/admin/riders/active/list"),
  });

  const cfgList: PayrollConfig[] = (configs ?? []) as any;
  const ridersList: Rider[] = (riders ?? []) as any;

  const toggleActive = useMutation({
    mutationFn: (vars: { riderId: string; isActive: boolean }) =>
      api.patch(`/admin/hr/payroll-configs/${vars.riderId}`, { isActive: vars.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "hr", "payroll-configs"] }),
    onError: (e: any) => toast.error(e?.data?.message ?? "Update failed"),
  });

  const defaultConfig = cfgList.find((c) => !c.riderId);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("রাইডার বেতন", "Rider Salary")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("প্রতি রাইডারের বেতন কনফিগারেশন দেখুন ও সম্পাদনা করুন", "View and edit per-rider salary configuration")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন কনফিগ", "Add Config")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("ডিফল্ট কনফিগারেশন", "Default Configuration")}</CardTitle>
        </CardHeader>
        <CardContent>
          {defaultConfig ? (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div>
                <div className="text-ink-500">{t("বেস বেতন", "Base Salary")}</div>
                <div className="font-semibold">{formatBDT(defaultConfig.baseSalary)}</div>
              </div>
              <div>
                <div className="text-ink-500">{t("প্রতি ডেলিভারি", "Per Delivery")}</div>
                <div className="font-semibold">{formatBDT(defaultConfig.perDeliveryRate)}</div>
              </div>
              <div>
                <div className="text-ink-500">{t("COD কমিশন %", "COD Commission %")}</div>
                <div className="font-semibold">{defaultConfig.codCommissionPercent}%</div>
              </div>
              <div>
                <div className="text-ink-500">{t("সর্বোচ্চ অগ্রিম", "Max Advance")}</div>
                <div className="font-semibold">{formatBDT(defaultConfig.maxAdvance)}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(defaultConfig)}>
                <Pencil className="h-4 w-4" /> {t("সম্পাদনা", "Edit")}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-500">{t("কোন ডিফল্ট কনফিগারেশন নেই", "No default configuration set")}</p>
              <Button size="sm" onClick={() => setCreating({ id: null, riderId: null, riderName: null, baseSalary: 0, perDeliveryRate: 30, codCommissionPercent: 0, maxAdvance: 5000, isActive: true } as any)}>
                {t("ডিফল্ট তৈরি", "Create Default")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("রাইডার-নির্দিষ্ট কনফিগারেশন", "Rider-Specific Configurations")}</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : cfgList.filter((c) => c.riderId).length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন রাইডার-নির্দিষ্ট কনফিগ নেই", "No rider-specific configs yet")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-ink-200 dark:border-ink-300">
                <tr className="text-left text-xs text-ink-500">
                  <th className="p-2">{t("রাইডার", "Rider")}</th>
                  <th className="p-2">{t("বেস বেতন", "Base")}</th>
                  <th className="p-2">{t("প্রতি ডেলিভারি", "Per-Delivery")}</th>
                  <th className="p-2">{t("COD %", "COD %")}</th>
                  <th className="p-2">{t("সর্বোচ্চ অগ্রিম", "Max Adv.")}</th>
                  <th className="p-2">{t("সক্রিয়", "Active")}</th>
                  <th className="p-2">{t("অ্যাকশন", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {cfgList.filter((c) => c.riderId).map((c) => (
                  <tr key={c.id ?? c.riderId} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-200">
                    <td className="p-2 font-medium">{c.riderName ?? "—"}</td>
                    <td className="p-2">{formatBDT(c.baseSalary)}</td>
                    <td className="p-2">{formatBDT(c.perDeliveryRate)}</td>
                    <td className="p-2">{c.codCommissionPercent}%</td>
                    <td className="p-2">{formatBDT(c.maxAdvance)}</td>
                    <td className="p-2">
                      <Badge variant={c.isActive ? "success" : "muted"}>
                        {c.isActive ? t("হ্যাঁ", "Yes") : t("না", "No")}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => toggleActive.mutate({ riderId: c.riderId!, isActive: !c.isActive })}>
                          {c.isActive ? <X className="h-4 w-4 text-warning-700" /> : <Plus className="h-4 w-4 text-success-700" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <ConfigEditor
          config={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          riders={ridersList}
        />
      )}
    </div>
  );
}

function ConfigEditor({ config, onClose, riders }: { config: PayrollConfig | null; onClose: () => void; riders: Rider[] }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isCreate = !config;

  const [form, setForm] = useState({
    riderId: config?.riderId ?? "",
    baseSalary: config?.baseSalary ?? 0,
    perDeliveryRate: config?.perDeliveryRate ?? 30,
    codCommissionPercent: config?.codCommissionPercent ?? 0,
    maxAdvance: config?.maxAdvance ?? 5000,
    isActive: config?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: () =>
      isCreate
        ? api.post("/admin/hr/payroll-configs", {
            ...form,
            riderId: form.riderId === "" ? null : form.riderId,
          })
        : api.patch(`/admin/hr/payroll-configs/${config!.riderId ?? "default"}`, form),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "hr", "payroll-configs"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wallet className="h-4 w-4" />
            {isCreate ? t("নতুন কনফিগারেশন", "New Configuration") : t("কনফিগারেশন সম্পাদনা", "Edit Configuration")}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <Field label={t("রাইডার (খালি = ডিফল্ট)", "Rider (empty = default)")}>
            <select
              value={form.riderId}
              onChange={(e) => setForm((s) => ({ ...s, riderId: e.target.value }))}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            >
              <option value="">{t("— ডিফল্ট —", "— Default —")}</option>
              {riders.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.phone})</option>)}
            </select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("বেস বেতন (BDT)", "Base Salary (BDT)")}>
              <Input type="number" step="0.01" value={form.baseSalary} onChange={(e) => setForm((s) => ({ ...s, baseSalary: Number(e.target.value) }))} />
            </Field>
            <Field label={t("প্রতি ডেলিভারি (BDT)", "Per-Delivery (BDT)")}>
              <Input type="number" step="0.01" value={form.perDeliveryRate} onChange={(e) => setForm((s) => ({ ...s, perDeliveryRate: Number(e.target.value) }))} />
            </Field>
            <Field label={t("COD কমিশন %", "COD Commission %")}>
              <Input type="number" step="0.01" value={form.codCommissionPercent} onChange={(e) => setForm((s) => ({ ...s, codCommissionPercent: Number(e.target.value) }))} />
            </Field>
            <Field label={t("সর্বোচ্চ অগ্রিম (BDT)", "Max Advance (BDT)")}>
              <Input type="number" step="0.01" value={form.maxAdvance} onChange={(e) => setForm((s) => ({ ...s, maxAdvance: Number(e.target.value) }))} />
            </Field>
          </div>
          <Field label={t("সক্রিয়?", "Active?")}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} className="h-4 w-4 rounded border-ink-300 text-primary-700" />
              <span className="text-sm">{t("ব্যবহৃত হবে", "Will be applied")}</span>
            </label>
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
