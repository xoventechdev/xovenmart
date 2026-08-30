"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Power, Trash2, ShieldCheck, ShieldOff,
  Users as UsersIcon, UserCheck, Mail, Phone, Clock, X,
  Check, KeyRound, Settings as SettingsIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Staff {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: "ADMIN" | "MANAGER";
  isActive: boolean;
  lastLoginAt?: string | null;
  permissions?: Record<string, boolean>;
  createdAt: string;
}

interface PermissionEntry {
  key: string;
  module: string;
  moduleBn: string;
  moduleEn: string;
  action: "view" | "create" | "update" | "delete" | "export";
  labelBn: string;
  labelEn: string;
  defaultRoles: ("ADMIN" | "MANAGER")[];
  adminOnly?: boolean;
}

export default function StaffManagementPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.get("/auth/me") });
  const isAdmin = me?.admin?.role === "ADMIN";

  const { data: staff, isLoading } = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => api.get("/admin/staff"),
  });

  const { data: catalog } = useQuery({
    queryKey: ["admin", "permissions", "catalog"],
    queryFn: () => api.get("/admin/permissions/catalog"),
    enabled: isAdmin,
  });

  const [editing, setEditing] = useState<Staff | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingPerms, setManagingPerms] = useState<Staff | null>(null);

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/staff/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => {
      toast.success(t("স্ট্যাটাস আপডেট হয়েছে", "Status updated"));
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Update failed"),
  });

  const staffList: Staff[] = (staff ?? []) as any;
  const admins = staffList.filter((s) => s.role === "ADMIN");
  const managers = staffList.filter((s) => s.role === "MANAGER");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("স্টাফ ও অ্যাডমিন", "Staff & Admins")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("অ্যাডমিন এবং ম্যানেজারদের পরিচালনা করুন, পারমিশন সেট করুন", "Manage admins & managers, configure permissions")}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t("নতুন স্টাফ যোগ", "Add Staff")}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <Stat icon={ShieldCheck} label={t("অ্যাডমিন", "Admins")} value={admins.length} color="bg-primary-100 text-primary-700" />
        <Stat icon={UsersIcon} label={t("ম্যানেজার", "Managers")} value={managers.length} color="bg-info-100 text-info-700" />
        <Stat icon={UserCheck} label={t("সক্রিয় স্টাফ", "Active Staff")} value={staffList.filter((s) => s.isActive).length} color="bg-success-100 text-success-700" />
      </div>

      {/* Staff list */}
      <Card>
        <CardHeader>
          <CardTitle>{t("সব স্টাফ সদস্য", "All Staff Members")}</CardTitle>
          <CardDescription>{t("অ্যাডমিন সম্পূর্ণ অ্যাকসেস পায়। ম্যানেজার শুধুমাত্র নির্ধারিত পারমিশন।", "Admins have full access. Managers only assigned permissions.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : staffList.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন স্টাফ নেই", "No staff yet")}</p>
          ) : (
            <div className="space-y-2">
              {staffList.map((s) => (
                <StaffRow
                  key={s.id}
                  staff={s}
                  isMe={s.id === me?.admin?.id}
                  canManage={isAdmin}
                  onEdit={() => setEditing(s)}
                  onPermissions={() => setManagingPerms(s)}
                  onToggleActive={() => toggleActive.mutate({ id: s.id, isActive: !s.isActive })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permission catalog preview (read-only for non-admins) */}
      {!isAdmin && catalog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("আপনার পারমিশন", "Your Permissions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-500">
              {t("আপনার ম্যানেজার অ্যাকাউন্টে যে পারমিশনগুলো সক্রিয় আছে সেগুলো দেখুন।", "View which permissions are active for your manager account.")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Editor modal */}
      {(editing || creating) && (
        <StaffEditor
          staff={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          catalog={catalog}
        />
      )}

      {/* Permissions manager modal */}
      {managingPerms && (
        <PermissionsManager
          staff={managingPerms}
          catalog={catalog ?? []}
          onClose={() => setManagingPerms(null)}
        />
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold text-ink-900 dark:text-ink-900">{value}</div>
          <div className="text-xs text-ink-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffRow({
  staff, isMe, canManage, onEdit, onPermissions, onToggleActive,
}: {
  staff: Staff; isMe: boolean; canManage: boolean;
  onEdit: () => void; onPermissions: () => void; onToggleActive: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const customPerms = staff.permissions ? Object.keys(staff.permissions).length : 0;

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-md border p-3",
      staff.isActive ? "border-ink-200 dark:border-ink-300" : "border-ink-200 bg-ink-50 opacity-70 dark:border-ink-300 dark:bg-ink-100",
    )}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white",
          staff.role === "ADMIN" ? "bg-primary-700" : "bg-info-700",
        )}>
          {staff.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink-900 dark:text-ink-900">{staff.name}</span>
            {isMe && <Badge variant="info">{t("আপনি", "You")}</Badge>}
            <Badge variant={staff.role === "ADMIN" ? "default" : "info"}>
              {staff.role === "ADMIN" ? "👑 Admin" : "🔧 Manager"}
            </Badge>
            {!staff.isActive && <Badge variant="muted">{t("নিষ্ক্রিয়", "Inactive")}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{staff.email}</span>
            {staff.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{staff.phone}</span>}
            {staff.lastLoginAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />{t("শেষ লগইন", "Last login")} {new Date(staff.lastLoginAt).toLocaleDateString()}
              </span>
            )}
            {customPerms > 0 && (
              <Badge variant="muted" className="text-[10px]">
                {customPerms} {t("কাস্টম পারমিশন", "custom perms")}
              </Badge>
            )}
          </div>
        </div>
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} title={t("সম্পাদনা", "Edit")}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onPermissions} title={t("পারমিশন", "Permissions")}>
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggleActive} title={staff.isActive ? t("নিষ্ক্রিয় করুন", "Deactivate") : t("সক্রিয় করুন", "Activate")}>
            {staff.isActive ? <Power className="h-4 w-4 text-warning-700" /> : <Check className="h-4 w-4 text-success-700" />}
          </Button>
        </div>
      )}
    </div>
  );
}

function StaffEditor({
  staff, onClose, catalog,
}: {
  staff: Staff | null; onClose: () => void; catalog?: PermissionEntry[];
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isCreate = !staff;

  const [form, setForm] = useState({
    name: staff?.name ?? "",
    email: staff?.email ?? "",
    phone: staff?.phone ?? "",
    role: (staff?.role ?? "MANAGER") as "ADMIN" | "MANAGER",
    isActive: staff?.isActive ?? true,
    password: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (isCreate) return api.post("/admin/staff", form);
      return api.patch(`/admin/staff/${staff!.id}`, form);
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত হয়েছে", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <Modal title={isCreate ? t("নতুন স্টাফ", "New Staff") : t("স্টাফ সম্পাদনা", "Edit Staff")} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("নাম", "Name")}>
          <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} disabled={!isCreate} />
        </Field>
        <Field label={t("ফোন", "Phone")}>
          <Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
        </Field>
        <Field label={t("রোল", "Role")}>
          <select
            value={form.role}
            onChange={(e) => setForm((s) => ({ ...s, role: e.target.value as any }))}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
          >
            <option value="MANAGER">{t("ম্যানেজার (ব্যবসায়িক)", "Manager (Business)")}</option>
            <option value="ADMIN">{t("অ্যাডমিন (পূর্ণ অ্যাকসেস)", "Admin (Full Access)")}</option>
          </select>
        </Field>
        <Field label={isCreate ? t("পাসওয়ার্ড", "Password") : t("নতুন পাসওয়ার্ড (ঐচ্ছিক)", "New Password (optional)")} className="md:col-span-2">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
            placeholder={isCreate ? t("কমপক্ষে ৮ অক্ষর", "Minimum 8 chars") : t("পরিবর্তন করতে চাইলে লিখুন", "Leave blank to keep current")}
          />
        </Field>
        <Field label={t("সক্রিয়?", "Active?")} className="md:col-span-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-ink-300 text-primary-700"
            />
            <span className="text-sm">{t("এই অ্যাকাউন্ট সক্রিয়", "Account is active")}</span>
          </label>
        </Field>
      </div>

      {form.role === "MANAGER" && (
        <div className="mt-3 rounded-md bg-info-100 p-3 text-xs text-info-700 dark:bg-info-500/20">
          ℹ️ {t("ম্যানেজার শুধুমাত্র নির্ধারিত পারমিশন পাবে। 'পারমিশন' বোতাম দিয়ে টেকনিক্যাল সেটিংস (SEO, Staff, Audit, Templates, Maintenance) বন্ধ রাখুন।", "Manager only gets assigned permissions. Use the Permissions button to keep technical settings (SEO, Staff, Audit, Templates, Maintenance) off.")}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.email}>
          {save.isPending ? t("সংরক্ষণ হচ্ছে...", "Saving...") : t("সংরক্ষণ", "Save")}
        </Button>
      </div>
    </Modal>
  );
}

function PermissionsManager({
  staff, catalog, onClose,
}: {
  staff: Staff; catalog: PermissionEntry[]; onClose: () => void;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [overrides, setOverrides] = useState<Record<string, boolean>>({ ...(staff.permissions ?? {}) });

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/staff/${staff.id}`, { permissions: overrides }),
    onSuccess: () => {
      toast.success(t("পারমিশন সংরক্ষিত", "Permissions saved"));
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  // Default state per permission: true if role is in defaultRoles and no override, false otherwise
  const effective = (key: string): boolean => {
    if (key in overrides) return overrides[key];
    const p = catalog.find((x) => x.key === key);
    return p?.defaultRoles.includes(staff.role) ?? false;
  };

  const setOverride = (key: string, value: boolean | null) => {
    setOverrides((s) => {
      const next = { ...s };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const grouped = catalog.reduce<Record<string, PermissionEntry[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  return (
    <Modal title={`${t("পারমিশন", "Permissions")} — ${staff.name}`} onClose={onClose} wide>
      <div className="mb-3 rounded-md bg-primary-100 p-3 text-xs text-primary-700 dark:bg-primary-800 dark:text-primary-100">
        {t("গ্রিন = ডিফল্ট অনুমতি, লাল = স্পষ্টভাবে নিষিদ্ধ। নিল = কোনো ওভাররাইড নেই (রোল ডিফল্ট ব্যবহৃত)।", "Green = default allowed, red = explicitly denied. Empty = no override (uses role default).")}
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {Object.entries(grouped).map(([module, perms]) => (
          <div key={module} className="rounded-md border border-ink-200 dark:border-ink-300">
            <div className="border-b border-ink-200 bg-ink-50 px-3 py-2 dark:border-ink-300 dark:bg-ink-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-900 dark:text-ink-900">
                  {t(perms[0].moduleBn, perms[0].moduleEn)}
                </span>
                <div className="flex gap-1 text-xs">
                  <button
                    onClick={() => perms.forEach((p) => setOverride(p.key, true))}
                    className="rounded bg-success-100 px-2 py-0.5 text-success-700 hover:bg-success-500/30"
                  >
                    {t("সব অন", "All on")}
                  </button>
                  <button
                    onClick={() => perms.forEach((p) => setOverride(p.key, false))}
                    className="rounded bg-danger-100 px-2 py-0.5 text-danger-700 hover:bg-danger-500/30"
                  >
                    {t("সব অফ", "All off")}
                  </button>
                  <button
                    onClick={() => perms.forEach((p) => setOverride(p.key, null))}
                    className="rounded bg-ink-100 px-2 py-0.5 text-ink-700 hover:bg-ink-200"
                  >
                    {t("রিসেট", "Reset")}
                  </button>
                </div>
              </div>
            </div>
            <div className="divide-y divide-ink-200 dark:divide-ink-300">
              {perms.map((p) => {
                const isOverridden = p.key in overrides;
                const val = effective(p.key);
                return (
                  <div key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-900 dark:text-ink-900">
                        {t(p.labelBn, p.labelEn)}
                      </div>
                      <div className="font-mono text-[10px] text-ink-500">{p.key}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setOverride(p.key, true)}
                        className={cn(
                          "rounded px-2 py-1 text-xs font-semibold",
                          val && isOverridden
                            ? "bg-success-500 text-white"
                            : "bg-success-100 text-success-700 hover:bg-success-500/30",
                        )}
                      >
                        ✓ {t("অনুমতি", "Allow")}
                      </button>
                      <button
                        onClick={() => setOverride(p.key, false)}
                        className={cn(
                          "rounded px-2 py-1 text-xs font-semibold",
                          !val && isOverridden
                            ? "bg-danger-500 text-white"
                            : "bg-danger-100 text-danger-700 hover:bg-danger-500/30",
                        )}
                      >
                        ✗ {t("নিষিদ্ধ", "Deny")}
                      </button>
                      {isOverridden && (
                        <button
                          onClick={() => setOverride(p.key, null)}
                          title={t("ওভাররাইড সরান", "Remove override")}
                          className="rounded bg-ink-100 px-2 py-1 text-xs text-ink-700 hover:bg-ink-200"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-ink-200 pt-3 dark:border-ink-300">
        <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t("সংরক্ষণ হচ্ছে...", "Saving...") : `${t("সংরক্ষণ", "Save")} (${Object.keys(overrides).length} ${t("ওভাররাইড", "overrides")})`}
        </Button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 dark:border-ink-300 dark:bg-ink-50">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      {children}
    </div>
  );
}
