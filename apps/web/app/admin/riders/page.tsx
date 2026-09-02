"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bike,
  UserCheck,
  UserX,
  DollarSign,
  Plus,
  Edit,
  Ban,
  CheckCircle,
  Phone,
  Mail,
  Package,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Rider {
  id: string;
  name: string;
  email: string;
  phone: string;
  nidNumber?: string | null;
  isActive: boolean;
  currentFloat: number;
  todayDeliveries: number;
  totalDeliveries: number;
  todayCODCollected: number;
  lastActiveAt: string | null;
  createdAt: string;
}

export default function RidersPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Rider | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const { data: ridersRes, isLoading } = useQuery({
    queryKey: ["admin", "riders", "all", page, perPage],
    queryFn: () => api.get<{ items: Rider[]; total: number; page: number; perPage: number }>(`/admin/riders/all?page=${page}&perPage=${perPage}`),
  });

  const toggleBlock = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/riders/${vars.id}/block`, { isActive: vars.isActive }),
    onSuccess: () => {
      toast.success(t("আপ�েট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "riders"] });
    },
    onError: (e: any) =>
      toast.error(e?.data?.message ?? t("ব্যর্থ", "Failed")),
  });

  const list: Rider[] = (ridersRes?.items ?? []) as any;
  const totalRiders = ridersRes?.total ?? list.length;
  const filtered = list.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q)
    );
  });

  const activeRiders = list.filter((r) => r.isActive).length;
  const todayCOD = list.reduce((s, r) => s + (r.todayCODCollected ?? 0), 0);
  const totalFloat = list.reduce((s, r) => s + (r.currentFloat ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("রাই�ার", "Riders")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "ডেলিভারি রাইডার পরিচালনা ও নিরীক্�ণ",
              "Manage and monitor delivery riders",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/riders/cash">
            <Button variant="outline">
              <DollarSign className="h-4 w-4" /> {t("ক্যাশ", "Cash")}
            </Button>
          </Link>
          <Link href="/admin/riders/active">
            <Button variant="outline">
              <UserCheck className="h-4 w-4" /> {t("সক্রিয়", "Active")}
            </Button>
          </Link>
          <Link href="/admin/riders/new">
            <Button>
              <Plus className="h-4 w-4" /> {t("নতুন রাইডার", "Add Rider")}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat
          icon={<Bike className="h-4 w-4" />}
          label={t("মোট রাইডার", "Total Riders")}
          value={totalRiders}
          color="primary"
        />
        <Stat
          icon={<UserCheck className="h-4 w-4" />}
          label={t("সক্রিয়", "Active")}
          value={activeRiders}
          color="success"
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label={t("আজকের COD", "Today's COD")}
          value={`৳${todayCOD.toLocaleString()}`}
          color="info"
        />
        <Stat
          icon={<Package className="h-4 w-4" />}
          label={t("মোট �্লোট বকেয়া", "Total Float Outstanding")}
          value={`৳${totalFloat.toLocaleString()}`}
          color="warning"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("সব রাইডার", "All Riders")}</CardTitle>
            <Input
              placeholder={t("খুঁজুন...", "Search...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
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
              {t("কোন রাইডার নেই", "No riders")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-500 dark:border-ink-300 dark:bg-ink-100">
                    <th className="px-3 py-2">{t("নাম", "Name")}</th>
                    <th className="px-3 py-2">{t("যোগাযোগ", "Contact")}</th>
                    <th className="px-3 py-2">{t("অবস্থা", "Status")}</th>
                    <th className="px-3 py-2 text-right">
                      {t("ফ্লোট", "Float")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("আজকের ডেলিভারি", "Today's Deliveries")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("মোট", "Total")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("কর্ম", "Actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        {r.nidNumber && (
                          <div className="font-mono text-[10px] text-ink-500">
                            NID: {r.nidNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 text-xs">
                          <Mail className="h-3 w-3 text-ink-400" />
                          {r.email}
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <Phone className="h-3 w-3 text-ink-400" />
                          {r.phone}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.isActive ? (
                          <Badge variant="success">
                            <UserCheck className="mr-1 h-3 w-3" />{" "}
                            {t("সক্রিয়", "Active")}
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            <UserX className="mr-1 h-3 w-3" />{" "}
                            {t("নিষ্ক্রিয়", "Inactive")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ৳{(r.currentFloat ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.todayDeliveries ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.totalDeliveries ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing(r)}
                            title={t("সম্পাদনা", "Edit")}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              toggleBlock.mutate({
                                id: r.id,
                                isActive: !r.isActive,
                              })
                            }
                            title={
                              r.isActive
                                ? t("ব্লক করুন", "Block")
                                : t("আনব্লক করুন", "Unblock")
                            }
                          >
                            {r.isActive ? (
                              <Ban className="h-4 w-4 text-danger-700" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-success-700" />
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
            total={totalRiders}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
            showRange
          />
        </CardContent>
      </Card>

      {editing && (
        <RiderEditor
          rider={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
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

function RiderEditor({
  rider,
  onClose,
}: {
  rider: Rider;
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [form, setForm] = useState({
    name: rider.name,
    phone: rider.phone,
    isActive: rider.isActive,
    password: "",
  });

  const save = useMutation({
    mutationFn: () => {
      const body: any = {
        name: form.name,
        phone: form.phone,
        isActive: form.isActive,
      };
      if (form.password) body.password = form.password;
      return api.patch(`/admin/riders/${rider.id}`, body);
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "riders"] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e?.data?.message ?? t("ব্যর্থ", "Failed")),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold">
            {t("রাইডার সম্পাদনা", "Edit Rider")}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Activity className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          <Field label={t("নাম", "Name")}>
            <Input
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
          </Field>
          <Field label={t("ফোন", "Phone")}>
            <Input
              value={form.phone}
              onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
            />
          </Field>
          <Field
            label={t("নতুন পাসওয়ার্ড (ঐচ্ছিক)", "New password (optional)")}
            hint={t(
              "শুধুমাত্র ADMIN পরিবর্তন করতে পারবে",
              "Only ADMIN can change password",
            )}
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((s) => ({ ...s, password: e.target.value }))
              }
              placeholder="••••••••"
            />
          </Field>
          <Field label={t("সক্রিয়?", "Active?")}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((s) => ({ ...s, isActive: e.target.checked }))
                }
                className="h-4 w-4 rounded border-ink-300 text-primary-700"
              />
              <span className="text-sm">
                {t("কাজ করতে পারবে", "Can take deliveries")}
              </span>
            </label>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name || !form.phone}
          >
            {t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
