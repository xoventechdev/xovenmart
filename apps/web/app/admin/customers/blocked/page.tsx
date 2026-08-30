"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  UserX,
  Search,
  RefreshCw,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";

interface CustomerItem {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  isBlocked: boolean;
  referralCode: string;
  createdAt: string;
  _count: { orders: number };
  lifetimeValue: number;
}

export default function BlockedCustomersPage() {
  const { lang } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const params = new URLSearchParams();
  if (debounced) params.set("q", debounced);
  params.set("perPage", "100");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "customers", "blocked", debounced],
    queryFn: () => api.get<{ items: CustomerItem[]; total: number }>(`/admin/customers/blocked?${params.toString()}`),
  });

  const unblock = useMutation({
    mutationFn: (vars: { id: string; name: string | null }) =>
      api.patch(`/admin/customers/${vars.id}/block`, { isBlocked: false }),
    onSuccess: () => {
      toast.success(t("আনব্লক করা হয়েছে", "Unblocked"));
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Failed"),
  });

  const handleUnblock = (c: CustomerItem) => {
    const msg = t(`${c.name ?? c.phone} কে আনব্লক করবেন?`, `Unblock ${c.name ?? c.phone}?`);
    if (confirm(msg)) {
      unblock.mutate({ id: c.id, name: c.name });
    }
  };

  const items: CustomerItem[] = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/customers">
                <ArrowLeft className="h-4 w-4" />
                {t("সব গ্রাহক", "All Customers")}
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("নিষিদ্ধ গ্রাহক", "Blocked Customers")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("নিষিদ্ধ গ্রাহকদের তালিকা ও আনব্লক", "List and unblock blocked customers")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="danger">
            <UserX className="mr-1 h-3 w-3" />
            {t(`${total} জন নিষিদ্ধ`, `${total} blocked`)}
          </Badge>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("রিফ্রেশ", "Refresh")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("ফোন, নাম বা ইমেইল", "Phone, name or email")}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("নিষিদ্ধ গ্রাহক", "Blocked Customers")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন নিষিদ্ধ গ্রাহক নেই", "No blocked customers")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-50 text-left text-xs font-semibold uppercase text-ink-700 dark:bg-ink-200">
                  <tr>
                    <th className="px-4 py-2">{t("ফোন", "Phone")}</th>
                    <th className="px-4 py-2">{t("নাম", "Name")}</th>
                    <th className="px-4 py-2">{t("ইমেইল", "Email")}</th>
                    <th className="px-4 py-2 text-center">{t("অর্ডার", "Orders")}</th>
                    <th className="px-4 py-2 text-right">{t("মোট খরচ", "Total Spent")}</th>
                    <th className="px-4 py-2">{t("রেফারেল কোড", "Referral")}</th>
                    <th className="px-4 py-2">{t("যোগদান", "Joined")}</th>
                    <th className="px-4 py-2 text-right">{t("অ্যাকশন", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/admin/customers/${c.id}`)}
                      className="cursor-pointer border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-200"
                    >
                      <td className="px-4 py-2 font-mono text-sm">{c.phone}</td>
                      <td className="px-4 py-2">{c.name ?? "—"}</td>
                      <td className="px-4 py-2 text-sm text-ink-600">{c.email ?? "—"}</td>
                      <td className="px-4 py-2 text-center">
                        <Badge variant="muted">{c._count.orders}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right font-medium">৳{Number(c.lifetimeValue).toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{c.referralCode}</td>
                      <td className="px-4 py-2 text-sm text-ink-500">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnblock(c)}
                          disabled={unblock.isPending}
                        >
                          <CheckCircle className="h-4 w-4 text-success-700" />
                          {t("আনব্লক", "Unblock")}
                        </Button>
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
