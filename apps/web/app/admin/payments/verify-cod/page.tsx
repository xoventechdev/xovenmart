"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface CodPayment {
  id: string;
  orderId: string;
  orderNo: string | null;
  amount: number;
  status: string;
  createdAt: string;
  customer?: { name: string | null; phone: string | null; type: string } | null;
  order?: { orderNo: string; grandTotal: number; status: string };
}

export default function VerifyCodPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payments", "cod"],
    queryFn: () => api.get("/admin/payments/cod"),
  });

  const verify = useMutation({
    mutationFn: (vars: { id: string; status: "VERIFIED" | "FAILED" }) =>
      api.patch(`/admin/payments/${vars.id}/verify`, { status: vars.status }),
    onSuccess: (_, vars) => {
      toast.success(vars.status === "VERIFIED" ? t("যাচাই সম্পন্ন", "Verified") : t("ব্যর্থ হিসেবে চিহ্নিত", "Marked failed"));
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Action failed"),
  });

  const items: CodPayment[] = ((data as any)?.items ?? []) as any;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("COD যাচাই", "Verify COD")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("ডেলিভারি হওয়া COD অর্ডারের পেমেন্ট যাচাই করুন", "Verify payments for delivered COD orders")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4" /> {t("যাচাই বিচারাধীন", "Awaiting verification")} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন COD অর্ডার যাচাই বিচারাধীন নেই", "No COD orders awaiting verification")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500 dark:border-ink-300">
                    <th className="px-2 py-2">{t("অর্ডার", "Order")}</th>
                    <th className="px-2 py-2">{t("কাস্টমার", "Customer")}</th>
                    <th className="px-2 py-2">{t("ফোন", "Phone")}</th>
                    <th className="px-2 py-2">{t("টাকা", "Amount")}</th>
                    <th className="px-2 py-2">{t("অর্ডার স্ট্যাটাস", "Order Status")}</th>
                    <th className="px-2 py-2">{t("তারিখ", "Date")}</th>
                    <th className="px-2 py-2">{t("অ্যাকশন", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-b border-ink-100 hover:bg-ink-50 dark:border-ink-200 dark:hover:bg-ink-100">
                      <td className="px-2 py-2 font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <span>{p.orderNo ?? p.orderId.slice(0, 8)}</span>
                          {p.orderNo && <CopyButton value={p.orderNo} />}
                        </div>
                      </td>
                      <td className="px-2 py-2">{p.customer?.name ?? <span className="text-ink-400">—</span>}</td>
                      <td className="px-2 py-2 font-mono text-xs">{p.customer?.phone ?? <span className="text-ink-400">—</span>}</td>
                      <td className="px-2 py-2 font-semibold">৳{p.amount.toLocaleString()}</td>
                      <td className="px-2 py-2"><Badge variant="muted">{p.order?.status ?? "—"}</Badge></td>
                      <td className="px-2 py-2 text-xs text-ink-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => verify.mutate({ id: p.id, status: "VERIFIED" })}>
                            <CheckCircle className="h-3 w-3" /> {t("যাচাই", "Verify")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => verify.mutate({ id: p.id, status: "FAILED" })}>
                            <XCircle className="h-3 w-3 text-danger-700" />
                          </Button>
                        </div>
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
