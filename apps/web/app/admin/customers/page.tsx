"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Users,
  UserCheck,
  UserX,
  Gift,
  Search,
  RefreshCw,
  Ban,
  CheckCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface CustomerItem {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  isBlocked: boolean;
  referralCode: string;
  referredById: string | null;
  referredBy: { id: string; name: string | null; phone: string } | null;
  registeredAt: string | null;
  createdAt: string;
  _count: {
    orders: number;
    referralsMade: number;
    addresses: number;
  };
  lifetimeValue: number;
}

type FilterTab = "all" | "blocked";

export default function CustomersPage() {
  const { lang } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(1);
  const perPage = 25;

  // Debounce search
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const params = new URLSearchParams();
  if (debounced) params.set("q", debounced);
  if (tab === "blocked") params.set("blocked", "true");
  params.set("page", String(page));
  params.set("perPage", String(perPage));

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "customers", debounced, tab, page],
    queryFn: () => api.get<{ items: CustomerItem[]; total: number }>(`/admin/customers?${params.toString()}`),
  });

  // Stats — fetch without filter
  const { data: statsAll } = useQuery({
    queryKey: ["admin", "customers", "stats", "all"],
    queryFn: () => api.get<{ items: CustomerItem[]; total: number }>("/admin/customers?perPage=1"),
  });
  const { data: statsRegistered } = useQuery({
    queryKey: ["admin", "customers", "stats", "registered"],
    queryFn: () => api.get<{ items: CustomerItem[]; total: number }>("/admin/customers?perPage=1&blocked=false"),
  });
  const { data: statsBlocked } = useQuery({
    queryKey: ["admin", "customers", "stats", "blocked"],
    queryFn: () => api.get<{ items: CustomerItem[]; total: number }>("/admin/customers?perPage=1&blocked=true"),
  });
  const { data: statsAllFull } = useQuery({
    queryKey: ["admin", "customers", "stats", "ltv"],
    queryFn: () => api.get<{ items: CustomerItem[]; total: number }>("/admin/customers?perPage=1000"),
  });

  const lifetimeTotal = useMemo(() => {
    if (!statsAllFull?.items) return 0;
    return statsAllFull.items.reduce((s, c) => s + Number(c.lifetimeValue ?? 0), 0);
  }, [statsAllFull]);

  const items: CustomerItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const toggleBlock = useMutation({
    mutationFn: (vars: { id: string; isBlocked: boolean; name: string | null }) =>
      api.patch(`/admin/customers/${vars.id}/block`, { isBlocked: vars.isBlocked }),
    onSuccess: (_, vars) => {
      toast.success(vars.isBlocked ? t("নিষিদ্ধ করা হয়েছে", "Blocked") : t("আনব্লক করা হয়েছে", "Unblocked"));
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Failed"),
  });

  const handleToggle = (c: CustomerItem) => {
    const action = c.isBlocked ? "unblock" : "block";
    const msg = c.isBlocked
      ? t(`${c.name ?? c.phone} কে আনব্লক করবেন?`, `Unblock ${c.name ?? c.phone}?`)
      : t(`${c.name ?? c.phone} কে নিষিদ্ধ করবেন?`, `Block ${c.name ?? c.phone}?`);
    if (confirm(msg)) {
      toggleBlock.mutate({ id: c.id, isBlocked: !c.isBlocked, name: c.name });
    }
  };

  const statsCards = [
    {
      label: t("মোট গ্রাহক", "Total Customers"),
      value: statsAll?.total ?? 0,
      icon: Users,
      color: "text-primary-700 bg-primary-100 dark:bg-primary-800",
    },
    {
      label: t("নিবন্ধিত", "Registered"),
      value: statsRegistered?.total ?? 0,
      icon: UserCheck,
      color: "text-success-700 bg-success-100",
    },
    {
      label: t("নিষিদ্ধ", "Blocked"),
      value: statsBlocked?.total ?? 0,
      icon: UserX,
      color: "text-danger-700 bg-danger-100",
    },
    {
      label: t("মোট লাইফটাইম মূল্য", "Total Lifetime Value"),
      value: `৳${lifetimeTotal.toFixed(2)}`,
      icon: Gift,
      color: "text-warning-700 bg-warning-100",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("সব গ্রাহক", "All Customers")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("নিবন্ধিত গ্রাহকদের তালিকা � ব্যবস্থাপনা", "List and manage registered customers")}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("রিফ্রেশ", "Refresh")}
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((s, i) => {
          const Icon = s.icon;
          return (
            <Card key={i}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-md ${s.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-ink-500">{s.label}</div>
                  <div className="text-xl font-bold text-ink-900 dark:text-ink-900">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("ফোন, নাম, ইমেইল বা রেফারেল কোড", "Phone, name, email or referral code")}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 rounded-md border border-ink-200 bg-white p-1 dark:border-ink-300 dark:bg-ink-50">
              <button
                onClick={() => { setTab("all"); setPage(1); }}
                className={`rounded px-3 py-1 text-sm font-medium ${tab === "all" ? "bg-primary-100 text-primary-700" : "text-ink-600"}`}
              >
                {t("সব", "All")}
              </button>
              <button
                onClick={() => { setTab("blocked"); setPage(1); }}
                className={`rounded px-3 py-1 text-sm font-medium ${tab === "blocked" ? "bg-danger-100 text-danger-700" : "text-ink-600"}`}
              >
                {t("নিষিদ্ধ", "Blocked")}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>{t("গ্রাহক তালিকা", "Customer List")}</CardTitle>
          <span className="text-sm text-ink-500">{t(`${total} জন`, `${total} total`)}</span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন গ্রাহক নে�", "No customers")}</p>
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
                    <th className="px-4 py-2">{t("রেফারেল কোড", "Referral Code")}</th>
                    <th className="px-4 py-2">{t("অবস্থা", "Status")}</th>
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
                      <td className="px-4 py-2">
                        {c.isBlocked ? (
                          <Badge variant="danger">{t("নি�িদ্ধ", "Blocked")}</Badge>
                        ) : (
                          <Badge variant="success">{t("সক্রিয়", "Active")}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-ink-500">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggle(c)}
                          disabled={toggleBlock.isPending}
                          title={c.isBlocked ? t("আনব্লক", "Unblock") : t("নিষিদ্�", "Block")}
                        >
                          {c.isBlocked ? (
                            <CheckCircle className="h-4 w-4 text-success-700" />
                          ) : (
                            <Ban className="h-4 w-4 text-danger-700" />
                          )}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-500">
            {t(`পৃষ্ঠা ${page} / ${totalPages}`, `Page ${page} of ${totalPages}`)}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
              {t("আগের", "Prev")}
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
              {t("পরের", "Next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
