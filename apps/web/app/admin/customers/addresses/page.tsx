"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

interface AddressRow {
  id: string;
  label: string | null;
  area: string;
  landmark: string | null;
  fullText: string;
  isDefault: boolean;
  createdAt: string;
  user?: { id: string; name: string | null; phone: string };
}

export default function CustomerAddressesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 100;

  // We fetch customer list, then for each fetch their addresses (paged).
  // For Day-1 simplicity we fetch all customers w/ addresses count then merge.
  const params = new URLSearchParams();
  params.set("perPage", "1000");

  const { data: custData } = useQuery({
    queryKey: ["admin", "customers", "all-for-addresses"],
    queryFn: () => api.get<{ items: any[]; total: number }>(`/admin/customers?${params.toString()}`),
  });

  // Fetch addresses for each user in parallel
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "all-addresses", page, search, custData?.total],
    queryFn: async () => {
      const customers = custData?.items ?? [];
      const results: AddressRow[] = [];
      // Bounded: fetch addresses for first 200 customers (addresses count for rest are 0)
      const slice = customers.slice(0, 200);
      const promises = slice.map((c) =>
        api
          .get<AddressRow[]>(`/admin/customers/${c.id}/addresses`)
          .catch(() => [] as AddressRow[])
          .then((rows) =>
            rows.map((r) => ({
              ...r,
              user: { id: c.id, name: c.name, phone: c.phone },
            })),
          ),
      );
      const all = await Promise.all(promises);
      for (const arr of all) results.push(...arr);
      return results;
    },
    enabled: !!custData,
  });

  const allAddresses: AddressRow[] = data ?? [];
  const q = search.toLowerCase().trim();
  const filtered = q
    ? allAddresses.filter((a) =>
        (a.user?.name ?? "").toLowerCase().includes(q) ||
        (a.user?.phone ?? "").toLowerCase().includes(q) ||
        (a.area ?? "").toLowerCase().includes(q) ||
        (a.label ?? "").toLowerCase().includes(q) ||
        (a.fullText ?? "").toLowerCase().includes(q),
      )
    : allAddresses;

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("গ্রাহকের ঠিকানা", "Customer Addresses")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("সকল গ্রাহকের সংরক্ষিত ঠিকানা", "All customer saved addresses")}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("রিফ্রেশ", "Refresh")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t("নাম, ফোন, এলাকা বা ঠিকানা", "Name, phone, area or address")}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>{t("ঠিকানা তালিকা", "Addresses List")}</CardTitle>
          <span className="text-sm text-ink-500">
            {t(`${filtered.length} টি`, `${filtered.length} total`)}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
            ))}</div>
          ) : paginated.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন ঠিকানা নেই", "No addresses")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-ink-50 text-left text-xs font-semibold uppercase text-ink-700 dark:bg-ink-200">
                  <tr>
                    <th className="px-4 py-2">{t("গ্রাহক", "Customer")}</th>
                    <th className="px-4 py-2">{t("লেবেল", "Label")}</th>
                    <th className="px-4 py-2">{t("এলাকা", "Area")}</th>
                    <th className="px-4 py-2">{t("সম্পূর্ণ ঠিকানা", "Full Address")}</th>
                    <th className="px-4 py-2">{t("ডিফল্ট", "Default")}</th>
                    <th className="px-4 py-2">{t("তৈরি", "Created")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((a) => (
                    <tr key={a.id} className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-200">
                      <td className="px-4 py-2">
                        <div className="font-medium">{a.user?.name ?? "—"}</div>
                        <div className="font-mono text-xs text-ink-500">{a.user?.phone}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-ink-400" />
                          {a.label ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm">{a.area}</td>
                      <td className="px-4 py-2 text-sm text-ink-700 max-w-md">
                        <div className="line-clamp-2">{a.fullText}</div>
                        {a.landmark && (
                          <div className="text-xs text-ink-500">{a.landmark}</div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {a.isDefault ? (
                          <Badge variant="success">{t("ডিফল্ট", "Default")}</Badge>
                        ) : (
                          <span className="text-xs text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-ink-500">
                        {new Date(a.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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