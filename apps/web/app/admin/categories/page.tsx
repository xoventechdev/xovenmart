"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag, X, Save, FolderTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Category {
  id: string;
  nameBn: string;
  nameEn: string;
  slug: string;
  iconUrl?: string;
  parentId?: string | null;
  parent?: { id: string; nameEn: string; nameBn: string } | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { products: number; children: number };
}

export default function CategoriesPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: cats, isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api.get("/admin/categories"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/categories/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/categories/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });

  // Group: root categories with their children
  const list: Category[] = (cats ?? []) as any;
  const roots = list.filter((c) => !c.parentId);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("সব ক্যাটাগরি", "All Categories")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("পণ্য ক্যাটাগরি ও সাব-ক্যাটাগরি পরিচালনা করুন", "Manage product categories and sub-categories")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন ক্যাটাগরি", "New Category")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : roots.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন ক্যাটাগরি নেই", "No categories")}</p>
          ) : (
            <div className="space-y-3">
              {roots.map((c) => {
                const children = list.filter((x) => x.parentId === c.id);
                return (
                  <div key={c.id} className="rounded-md border border-ink-200 dark:border-ink-300">
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                        <Tag className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{lang === "bn" ? c.nameBn : c.nameEn}</span>
                          <Badge variant="muted" className="font-mono text-[10px]">/{c.slug}</Badge>
                          {!c.isActive && <Badge variant="warning">{t("নিষ্ক্রিয়", "Inactive")}</Badge>}
                        </div>
                        <div className="text-xs text-ink-500">
                          {c._count?.products ?? 0} {t("পণ্য", "products")} • {children.length} {t("সাব-ক্যাটাগরি", "sub-categories")}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })}>
                          {c.isActive ? <X className="h-4 w-4 text-warning-700" /> : <Plus className="h-4 w-4 text-success-700" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(c.id); }}>
                          <Trash2 className="h-4 w-4 text-danger-700" />
                        </Button>
                      </div>
                    </div>
                    {children.length > 0 && (
                      <div className="border-t border-ink-200 bg-ink-50 p-2 dark:border-ink-300 dark:bg-ink-100">
                        {children.map((child) => (
                          <div key={child.id} className="flex items-center gap-2 rounded p-2 hover:bg-white dark:hover:bg-ink-50">
                            <FolderTree className="h-3 w-3 text-ink-400" />
                            <span className="flex-1 text-sm">{lang === "bn" ? child.nameBn : child.nameEn}</span>
                            <Badge variant="muted" className="font-mono text-[10px]">/{child.slug}</Badge>
                            <Badge variant="outline">{child._count?.products ?? 0} {t("পণ্য", "products")}</Badge>
                            {!child.isActive && <Badge variant="warning">{t("নিষ্ক্রিয়", "Inactive")}</Badge>}
                            <Button variant="ghost" size="icon" onClick={() => setEditing(child)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => { if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(child.id); }}>
                              <Trash2 className="h-3 w-3 text-danger-700" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <CategoryEditor category={editing} allCategories={list} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}

function CategoryEditor({ category, allCategories, onClose }: { category: Category | null; allCategories: Category[]; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isCreate = !category;

  const [form, setForm] = useState({
    nameBn: category?.nameBn ?? "",
    nameEn: category?.nameEn ?? "",
    slugEn: category?.slug ?? "",
    descriptionBn: "",
    descriptionEn: "",
    iconUrl: category?.iconUrl ?? "",
    parentId: category?.parentId ?? "",
    sortOrder: category?.sortOrder ?? 0,
    isActive: category?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: () => (isCreate ? api.post("/admin/categories", form) : api.patch(`/admin/categories/${category!.id}`, form)),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "categories"] });
      qc.invalidateQueries({ queryKey: ["catalog", "categories"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  // Parent options: only root categories (to prevent deep nesting)
  const parentOptions = allCategories.filter((c) => !c.parentId && c.id !== category?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold">{isCreate ? t("নতুন ক্যাটাগরি", "New Category") : t("ক্যাটাগরি সম্পাদনা", "Edit Category")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t("নাম (বাংলা)", "Name (BN)")}>
              <Input value={form.nameBn} onChange={(e) => setForm((s) => ({ ...s, nameBn: e.target.value }))} />
            </Field>
            <Field label={t("নাম (EN)", "Name (EN)")}>
              <Input value={form.nameEn} onChange={(e) => setForm((s) => ({ ...s, nameEn: e.target.value }))} />
            </Field>
            <Field label="Slug" hint={t("URL-friendly identifier", "URL-friendly identifier")}>
              <Input value={form.slugEn} onChange={(e) => setForm((s) => ({ ...s, slugEn: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} />
            </Field>
            <Field label={t("প্যারেন্ট", "Parent")}>
              <select value={form.parentId} onChange={(e) => setForm((s) => ({ ...s, parentId: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
                <option value="">{t("— রুট ক্যাটাগরি —", "— Root category —")}</option>
                {parentOptions.map((p) => <option key={p.id} value={p.id}>{lang === "bn" ? p.nameBn : p.nameEn}</option>)}
              </select>
            </Field>
            <Field label={t("আইকন URL", "Icon URL")} className="md:col-span-2">
              <Input value={form.iconUrl} onChange={(e) => setForm((s) => ({ ...s, iconUrl: e.target.value }))} placeholder="https://..." />
            </Field>
            <Field label={t("অর্ডার", "Sort order")}>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm((s) => ({ ...s, sortOrder: Number(e.target.value) }))} />
            </Field>
            <Field label={t("সক্রিয়?", "Active?")}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} className="h-4 w-4 rounded border-ink-300 text-primary-700" />
                <span className="text-sm">{t("কাস্টমার দেখবে", "Visible to customers")}</span>
              </label>
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.nameBn || !form.nameEn}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
