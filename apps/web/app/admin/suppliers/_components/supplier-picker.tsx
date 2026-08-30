"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface OrderItemLite {
  id: string;
  qty: number;
  nameSnapshot?: string;
  productId: string;
}

interface SupplierLite {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  phone?: string | null;
  rating?: number;
}

interface ExistingLink {
  orderItemId: string;
  supplierId: string;
  qty: number;
  unitCost: number | null;
  note: string | null;
  recordedAt: string;
  supplier: SupplierLite;
}

/**
 * Embedded in the admin order-detail page. Lets admin record which
 * vendor(s) supplied a given order-item line. Multiple suppliers can
 * split the qty (necessary for partial fulfillment + return tracking).
 */
export function SupplierPicker({ orderItem }: { orderItem: OrderItemLite }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [selected, setSelected] = useState<string>("");
  const [qty, setQty] = useState<number>(orderItem.qty);
  const [unitCost, setUnitCost] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const { data: suppliers } = useQuery({
    queryKey: ["admin", "suppliers", "lookup"],
    queryFn: () => api.get("/admin/suppliers/lookup"),
  });

  const { data: links, isLoading } = useQuery({
    queryKey: ["admin", "supplier-links", orderItem.id],
    queryFn: () => api.get(`/admin/suppliers/order-items/${orderItem.id}`),
  });

  const linkMutation = useMutation({
    mutationFn: () =>
      api.post(`/admin/suppliers/order-items/${orderItem.id}`, {
        supplierId: selected,
        qty: Number(qty),
        unitCost: unitCost ? Number(unitCost) : undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success(t("লিংক যোগ হয়েছে", "Sourcing recorded"));
      setSelected("");
      setQty(orderItem.qty);
      setUnitCost("");
      setNote("");
      qc.invalidateQueries({
        queryKey: ["admin", "supplier-links", orderItem.id],
      });
    },
    onError: (e: any) => {
      const msg =
        e?.data?.message?.toString?.() ??
        (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ??
        t("সংরক্ষণ ব্যর্থ", "Save failed");
      toast.error(msg);
    },
  });

  const unlink = useMutation({
    mutationFn: (supplierId: string) =>
      api.delete(
        `/admin/suppliers/order-items/${orderItem.id}/${supplierId}`,
      ),
    onSuccess: () => {
      toast.success(t("লিংক মুছে ফেলা হয়েছে", "Link removed"));
      qc.invalidateQueries({
        queryKey: ["admin", "supplier-links", orderItem.id],
      });
    },
  });

  const list: SupplierLite[] = (suppliers ?? []) as any;
  const existing: ExistingLink[] = (links ?? []) as any;
  const totalUsed = existing.reduce((s, l) => s + l.qty, 0);
  const remaining = Math.max(0, orderItem.qty - totalUsed);

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3 dark:border-ink-300 dark:bg-ink-100/40">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-700 dark:text-ink-900">
        <Building2 className="h-3.5 w-3.5" />
        {t("ভেন্ডর সোর্সিং (অ্যাডমিন)", "Vendor sourcing (admin only)")}
        <span className="ml-auto text-[10px] text-ink-500">
          {t(
            `${remaining}/${orderItem.qty} বাকি`,
            `${remaining}/${orderItem.qty} left`,
          )}
        </span>
      </div>

      {isLoading ? (
        <div className="h-6 w-32 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
      ) : existing.length > 0 ? (
        <ul className="mb-3 space-y-1 text-xs">
          {existing.map((l) => (
            <li
              key={l.supplierId}
              className="flex items-center justify-between rounded bg-white px-2 py-1.5 dark:bg-ink-100"
            >
              <span>
                <span className="font-medium">
                  {lang === "bn" ? l.supplier.nameBn : l.supplier.nameEn}
                </span>
                <span className="ml-2 font-mono text-ink-500">
                  ×{l.qty}
                </span>
                {l.unitCost != null && (
                  <span className="ml-2 font-mono text-ink-500">
                    ৳{Number(l.unitCost).toLocaleString()}
                  </span>
                )}
                {l.note && (
                  <span className="ml-2 text-ink-500">— {l.note}</span>
                )}
              </span>
              <button
                onClick={() => unlink.mutate(l.supplierId)}
                className="ml-2 rounded p-1 text-danger-700 hover:bg-danger-100 dark:hover:bg-danger-500/20"
                title={t("মুছুন", "Remove")}
              >
                {unlink.isPending && unlink.variables === l.supplierId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs italic text-ink-500">
          {t("কোন ভেন্ডর সোর্সিং নেই", "No vendor recorded yet")}
        </p>
      )}

      {remaining > 0 && (
        <div className="grid grid-cols-12 gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="col-span-5 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs dark:border-ink-300 dark:bg-ink-100"
          >
            <option value="">
              {t("ভেন্ডর নির্বাচন...", "Pick vendor...")}
            </option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {lang === "bn" ? s.nameBn : s.nameEn}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={1}
            max={remaining}
            value={qty}
            onChange={(e) => setQty(Math.min(remaining, Number(e.target.value) || 0))}
            className="col-span-2 h-7 text-xs"
            placeholder={t("পরিমাণ", "Qty")}
          />
          <Input
            type="number"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            className="col-span-2 h-7 text-xs"
            placeholder={t("খরচ", "Cost")}
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="col-span-2 h-7 text-xs"
            placeholder={t("নোট", "Note")}
          />
          <Button
            size="sm"
            onClick={() => linkMutation.mutate()}
            disabled={!selected || qty <= 0 || linkMutation.isPending}
            className="col-span-1 h-7"
          >
            {linkMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
