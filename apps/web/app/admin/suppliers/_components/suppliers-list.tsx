"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Plus,
  Pencil,
  Eye,
  EyeOff,
  Star,
  Phone,
  Mail,
  MapPin,
  Loader2,
  Trash2,
  AlertTriangle,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Supplier {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  area?: string | null;
  rating: number;
  isActive: boolean;
  sortOrder: number;
  _count?: { productLinks: number; itemLinks: number };
  createdAt: string;
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color: "primary" | "success" | "info" | "warning";
}) {
  const colorMap: Record<string, string> = {
    primary:
      "bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100",
    success:
      "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-100",
    info: "bg-info-100 text-info-700 dark:bg-info-500/20 dark:text-info-100",
    warning:
      "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded ${colorMap[color]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-500">{label}</div>
          <div className="truncate text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= value ? "fill-accent-500 text-accent-500" : "text-ink-300",
          )}
        />
      ))}
    </span>
  );
}

export function SuppliersList({
  filter,
  titleBn,
  titleEn,
  descBn,
  descEn,
}: {
  filter?: "all" | "active";
  titleBn: string;
  titleEn: string;
  descBn?: string;
  descEn?: string;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "suppliers", filter, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter === "active") params.set("isActive", "true");
      params.set("page", String(page));
      params.set("perPage", String(perPage));
      return api.get(`/admin/suppliers?${params.toString()}`);
    },
  });

  const items: Supplier[] = (data?.items ?? []) as any;
  const total: number = (data?.total ?? 0) as number;
  const activeCount = data?.activeCount ?? 0;

  const filtered = items.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.nameBn?.toLowerCase().includes(q) ||
      s.nameEn?.toLowerCase().includes(q) ||
      s.contactName?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.area?.toLowerCase().includes(q) ||
      s.slug?.toLowerCase().includes(q)
    );
  });

  const avgRating =
    items.length > 0
      ? items.reduce((s, x) => s + (x.rating ?? 0), 0) / items.length
      : 0;
  const productLinked = items.filter(
    (s) => (s._count?.productLinks ?? 0) > 0,
  ).length;
  const orderLinked = items.filter(
    (s) => (s._count?.itemLinks ?? 0) > 0,
  ).length;

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/suppliers/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success(t("আপডেট হয়েছে", "Updated"));
    },
  });

  const deleteSupplier = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/suppliers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success(t("সরবরাহকারী নিষ্ক্রিয় করা হয়েছে", "Supplier deactivated"));
    },
    onError: (e: any) => {
      const msg =
        e?.data?.message?.toString?.() ??
        (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ??
        t("মুছতে ব্যর্থ", "Delete failed");
      toast.error(msg);
    },
  });

  const confirmDelete = (s: Supplier) => {
    if (
      !window.confirm(
        t(
          `"${s.nameBn}" মুছে ফেলবেন/নিষ্ক্রিয় করবেন?`,
          `Delete/deactivate "${s.nameEn}"?`,
        ),
      )
    )
      return;
    deleteSupplier.mutate(s.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t(titleBn, titleEn)}
          </h1>
          {(descBn || descEn) && (
            <p className="mt-1 text-sm text-ink-500">
              {t(descBn ?? "", descEn ?? "")}
            </p>
          )}
        </div>
        <Link href="/admin/suppliers/new">
          <Button>
            <Plus className="h-4 w-4" /> {t("নতুন সরবরাহকারী", "Add Supplier")}
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat
          icon={<Building2 className="h-4 w-4" />}
          label={t("মোট সরবরাহকারী", "Total Suppliers")}
          value={total || items.length}
          color="primary"
        />
        <Stat
          icon={<Eye className="h-4 w-4" />}
          label={t("সক্রিয়", "Active")}
          value={activeCount}
          color="success"
        />
        <Stat
          icon={<Star className="h-4 w-4" />}
          label={t("গড় রেটিং", "Avg Rating")}
          value={avgRating ? avgRating.toFixed(1) : "—"}
          color="warning"
        />
        <Stat
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t("অর্ডারে যুক্ত", "Linked to Orders")}
          value={orderLinked}
          color="info"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>
              {filter === "active"
                ? t("সক্রিয় সরবরাহকারী", "Active Suppliers")
                : t("সব সরবরাহকারী", "All Suppliers")}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("নাম, ফোন, এলাকা...", "Name, phone, area...")}
                className="max-w-xs pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              {t("কোন সরবরাহকারী নেই", "No suppliers")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-500 dark:border-ink-300 dark:bg-ink-100">
                    <th className="px-3 py-2">{t("সরবরাহকারী", "Supplier")}</th>
                    <th className="px-3 py-2">{t("যোগাযোগ", "Contact")}</th>
                    <th className="px-3 py-2">{t("এলাকা", "Area")}</th>
                    <th className="px-3 py-2">{t("রেটিং", "Rating")}</th>
                    <th className="px-3 py-2 text-right">{t("পণ্য", "Products")}</th>
                    <th className="px-3 py-2">{t("অবস্থা", "Status")}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">
                              {lang === "bn" ? s.nameBn : s.nameEn}
                            </div>
                            <div className="font-mono text-[10px] text-ink-500">
                              {s.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.contactName && (
                          <div className="font-medium">{s.contactName}</div>
                        )}
                        {s.phone && (
                          <div className="flex items-center gap-1 text-ink-500">
                            <Phone className="h-3 w-3" /> {s.phone}
                          </div>
                        )}
                        {s.email && (
                          <div className="flex items-center gap-1 text-ink-500">
                            <Mail className="h-3 w-3" /> {s.email}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.area ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-ink-400" />
                            {s.area}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Stars value={s.rating ?? 3} />
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        <div>{s._count?.productLinks ?? 0}</div>
                        <div className="text-[10px] text-ink-500">
                          ({s._count?.itemLinks ?? 0} {t("অর্ডার", "orders")})
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {s.isActive ? (
                          <Badge variant="success">
                            {t("সক্রিয়", "Active")}
                          </Badge>
                        ) : (
                          <Badge variant="muted">
                            {t("নিষ্ক্রিয়", "Inactive")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/admin/suppliers/${s.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("বিস্তারিত", "View")}
                            >
                              <Eye className="h-4 w-4 text-primary-700" />
                            </Button>
                          </Link>
                          <Link href={`/admin/suppliers/${s.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t("সম্পাদনা", "Edit")}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              toggleActive.mutate({
                                id: s.id,
                                isActive: !s.isActive,
                              })
                            }
                            title={
                              s.isActive
                                ? t("নিষ্ক্রিয়", "Deactivate")
                                : t("সক্রিয়", "Activate")
                            }
                          >
                            {s.isActive ? (
                              <EyeOff className="h-4 w-4 text-warning-700" />
                            ) : (
                              <Eye className="h-4 w-4 text-success-700" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDelete(s)}
                            disabled={
                              deleteSupplier.isPending &&
                              deleteSupplier.variables === s.id
                            }
                            title={t("মুছুন", "Delete")}
                          >
                            {deleteSupplier.isPending &&
                            deleteSupplier.variables === s.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-danger-700" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-danger-700" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DataTablePagination
            page={page}
            perPage={perPage}
            total={total}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            showRange
          />
        </CardContent>
      </Card>
    </div>
  );
}