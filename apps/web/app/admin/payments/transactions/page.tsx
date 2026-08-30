"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet, RefreshCw, CreditCard, CheckCircle, XCircle, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Payment {
  id: string;
  orderId: string;
  orderNo: string | null;
  provider: string;
  amount: number;
  senderMsisdn: string | null;
  trxId: string | null;
  status: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  customer?: { name: string | null; phone: string | null; type: string } | null;
}

function statusVariant(s: string): "default" | "warning" | "success" | "danger" {
  if (s === "VERIFIED" || s === "DELIVERED") return "success";
  if (s === "FAILED") return "danger";
  if (s === "REFUNDED") return "warning";
  return "default";
}

export default function PaymentTransactionsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterProvider, setFilterProvider] = useState("");

  const { data: list } = useQuery({
    queryKey: ["admin", "payments", filterStatus, filterProvider],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterProvider) params.set("provider", filterProvider);
      params.set("perPage", "100");
      return api.get(`/admin/payments?${params.toString()}`);
    },
  });

  const { data: pending } = useQuery({ queryKey: ["admin", "payments", "pending"], queryFn: () => api.get("/admin/payments/pending") });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const items: Payment[] = ((list as any)?.items ?? []) as any;
  const pendingCount: number = ((pending as any)?.items ?? []).length;
  const verifiedToday = items.filter((p) => p.status === "VERIFIED" && p.verifiedAt && new Date(p.verifiedAt) >= today).length;
  const failed = items.filter((p) => p.status === "FAILED").length;
  const refundedThisMonth = items.filter((p) => p.status === "REFUNDED" && new Date(p.createdAt) >= startMonth).length;

  const verify = useMutation({
    mutationFn: (vars: { id: string; status: "VERIFIED" | "FAILED" }) =>
      api.patch(`/admin/payments/${vars.id}/verify`, { status: vars.status }),
    onSuccess: (_, vars) => {
      toast.success(vars.status === "VERIFIED" ? t("যাচাই হয়েছে", "Verified") : t("ব্যর্থ হিসেবে চিহ্নিত", "Marked failed"));
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Action failed"),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("পেমেন্ট লেনদেন", "Payment Transactions")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("সব পেমেন্ট যাচাই ও পরিচালনা করুন", "Verify and manage all payments")}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard icon={Wallet} label={t("বকেয়া", "Pending")} value={pendingCount} variant="warning" t={t} />
        <StatCard icon={CheckCircle} label={t("আজ যাচাই", "Verified today")} value={verifiedToday} variant="success" t={t} />
        <StatCard icon={XCircle} label={t("ব্যর্থ", "Failed")} value={failed} variant="danger" t={t} />
        <StatCard icon={RefreshCw} label={t("এই মাসে রিফান্ড", "Refunded this month")} value={refundedThisMonth} variant="info" t={t} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("স্ট্যাটাস", "Status")}</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("সব", "All")}</option>
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="FAILED">FAILED</option>
              <option value="REFUNDED">REFUNDED</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700 dark:text-ink-900">{t("প্রোভাইডার", "Provider")}</label>
            <select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("সব", "All")}</option>
              <option value="COD">COD</option>
              <option value="BKASH">bKash</option>
              <option value="NAGAD">Nagad</option>
              <option value="ROCKET">Rocket</option>
              <option value="BANK">Bank</option>
            </select>
          </div>
          <div className="flex items-center gap-1 text-xs text-ink-500">
            <Filter className="h-3 w-3" /> {items.length} {t("ফলাফল", "results")}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> {t("লেনদেন", "Transactions")} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন লেনদেন নেই", "No transactions yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                    <th className="px-2 py-2">{t("তারিখ", "Date")}</th>
                    <th className="px-2 py-2">{t("অর্ডার", "Order")}</th>
                    <th className="px-2 py-2">{t("প্রোভাইডার", "Provider")}</th>
                    <th className="px-2 py-2">{t("টাকা", "Amount")}</th>
                    <th className="px-2 py-2">{t("প্রেরক", "Sender")}</th>
                    <th className="px-2 py-2">{t("Trx ID", "Trx ID")}</th>
                    <th className="px-2 py-2">{t("স্ট্যাটাস", "Status")}</th>
                    <th className="px-2 py-2">{t("অ্যাকশন", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100">
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">{p.orderNo ?? p.orderId.slice(0, 8)}</span>
                          {p.orderNo && <CopyButton value={p.orderNo} />}
                        </div>
                        {p.customer?.phone && <div className="text-[10px] text-ink-500">{p.customer.phone}</div>}
                      </td>
                      <td className="px-2 py-2"><Badge variant="muted">{p.provider}</Badge></td>
                      <td className="px-2 py-2 font-semibold">৳{p.amount.toLocaleString()}</td>
                      <td className="px-2 py-2 font-mono text-xs">{p.senderMsisdn ?? <span className="text-ink-400">—</span>}</td>
                      <td className="px-2 py-2 font-mono text-xs">{p.trxId ?? <span className="text-ink-400">—</span>}</td>
                      <td className="px-2 py-2"><Badge variant={statusVariant(p.status)}>{p.status}</Badge></td>
                      <td className="px-2 py-2">
                        {p.status === "PENDING" ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => verify.mutate({ id: p.id, status: "VERIFIED" })}>
                              <CheckCircle className="h-3 w-3 text-success-700" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => verify.mutate({ id: p.id, status: "FAILED" })}>
                              <XCircle className="h-3 w-3 text-danger-700" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, variant, t }: { icon: any; label: string; value: number; variant: "warning" | "success" | "danger" | "info"; t: (b: string, e: string) => string }) {
  const colorMap: Record<string, string> = {
    warning: "bg-warning-100 text-warning-700",
    success: "bg-success-100 text-success-700",
    danger: "bg-danger-100 text-danger-700",
    info: "bg-info-100 text-info-700",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[variant]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-ink-500">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
