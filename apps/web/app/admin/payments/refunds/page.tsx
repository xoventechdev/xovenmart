"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Plus, X, Save, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Refund {
  id: string;
  orderId: string;
  orderNo: string | null;
  amount: number;
  status: string;
  rawPayload?: { reason?: string } | null;
  verifiedAt: string | null;
  createdAt: string;
}

interface Order {
  id: string;
  orderNo: string;
  grandTotal: number;
}

export default function RefundsPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", "refunds"],
    queryFn: () => api.get("/admin/payments/refunds"),
  });

  const items: Refund[] = ((data as any)?.items ?? []) as any;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("রিফান্ড", "Refunds")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("রিফান্ড রেকর্ড দেখুন ও নতুন তৈরি করুন", "View refund records and create new ones")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন রিফান্ড", "New Refund")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" /> {t("সব রিফান্ড", "All refunds")} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন রিফান্ড নেই", "No refunds yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                    <th className="px-2 py-2">{t("অর্ডার", "Order")}</th>
                    <th className="px-2 py-2">{t("টাকা", "Amount")}</th>
                    <th className="px-2 py-2">{t("কারণ", "Reason")}</th>
                    <th className="px-2 py-2">{t("তারিখ", "Date")}</th>
                    <th className="px-2 py-2">{t("স্ট্যাটাস", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100">
                      <td className="px-2 py-2 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span>{r.orderNo ?? r.orderId.slice(0, 8)}</span>
                          {r.orderNo && <CopyButton value={r.orderNo} />}
                        </div>
                      </td>
                      <td className="px-2 py-2 font-semibold">৳{r.amount.toLocaleString()}</td>
                      <td className="px-2 py-2 text-xs">{r.rawPayload?.reason ?? <span className="text-ink-400">—</span>}</td>
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(r.verifiedAt ?? r.createdAt).toLocaleDateString()}</td>
                      <td className="px-2 py-2"><Badge variant="warning">{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {creating && <RefundDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function RefundDialog({ onClose }: { onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [form, setForm] = useState({
    orderId: "",
    amount: 0,
    reason: "",
  });

  const { data: ordersData } = useQuery({
    queryKey: ["admin", "orders", "for-refund"],
    queryFn: () => api.get("/admin/orders?perPage=200&status=REFUNDED,CANCELLED,RETURNED"),
  });
  const orders: Order[] = ((ordersData as any)?.items ?? []) as any;

  const create = useMutation({
    mutationFn: () => api.post("/admin/payments/refunds", { ...form, amount: Number(form.amount) }),
    onSuccess: () => {
      toast.success(t("রিফান্ড তৈরি হয়েছে", "Refund created"));
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Refund failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{t("নতুন রিফান্ড", "New Refund")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("অর্ডার", "Order")}</label>
            <select value={form.orderId} onChange={(e) => {
              const id = e.target.value;
              const o = orders.find((x) => x.id === id);
              setForm((s) => ({ ...s, orderId: id, amount: o ? Number(o.grandTotal) : s.amount }));
            }} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
              <option value="">{t("— অর্ডার বাছুন —", "— Select order —")}</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.orderNo} — ৳{o.grandTotal}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("টাকা", "Amount")}</label>
            <Input type="number" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("কারণ", "Reason")}</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.orderId || !form.amount || !form.reason}>
            <DollarSign className="h-4 w-4" /> {create.isPending ? t("প্রসেসিং...", "Processing...") : t("রিফান্ড করুন", "Refund")}
          </Button>
        </div>
      </div>
    </div>
  );
}
