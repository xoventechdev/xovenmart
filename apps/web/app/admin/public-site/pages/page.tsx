"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye, EyeOff, Globe, GripVertical, Save, X, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface SitePage {
  id: string;
  slug: string;
  titleBn: string;
  titleEn: string;
  contentBn: string;
  contentEn: string;
  isPublished: boolean;
  showInFooter: boolean;
  order: number;
  seoTitle?: string;
  seoDescription?: string;
  updatedAt: string;
}

export default function PagesManagerPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: pages, isLoading } = useQuery({
    queryKey: ["admin", "site-pages"],
    queryFn: () => api.get("/admin/site-pages"),
  });

  const [editing, setEditing] = useState<SitePage | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/site-pages/${id}`),
    onSuccess: () => {
      toast.success(t("পেজ মুছে ফেলা হয়েছে", "Page deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "site-pages"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  const togglePublish = useMutation({
    mutationFn: (vars: { id: string; isPublished: boolean }) =>
      api.patch(`/admin/site-pages/${vars.id}`, { isPublished: vars.isPublished }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "site-pages"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("পেজ ম্যানেজার", "Pages Manager")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t("Privacy, Terms, About, Refund, Shipping এবং অন্যান্য স্ট্যাটিক পেজ পরিচালনা করুন", "Manage Privacy, Terms, About, Refund, Shipping & other static pages")}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন পেজ", "New Page")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}
            </div>
          ) : !pages || pages.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন পেজ নেই", "No pages yet")}</p>
          ) : (
            <div className="space-y-2">
              {(pages as SitePage[]).map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-md border border-ink-200 p-3 dark:border-ink-300">
                  <GripVertical className="h-4 w-4 text-ink-400" />
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-900 dark:text-ink-900">
                        {lang === "bn" ? p.titleBn : p.titleEn}
                      </span>
                      <Badge variant="muted" className="font-mono text-[10px]">/{p.slug}</Badge>
                      {p.isPublished ? (
                        <Badge variant="success">{t("প্রকাশিত", "Published")}</Badge>
                      ) : (
                        <Badge variant="warning">{t("ড্রাফট", "Draft")}</Badge>
                      )}
                      {p.showInFooter && <Badge variant="info">{t("ফুটারে", "In Footer")}</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {t("অর্ডার", "Order")}: {p.order} • {t("আপডেট", "Updated")}: {new Date(p.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)} title={t("সম্পাদনা", "Edit")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => togglePublish.mutate({ id: p.id, isPublished: !p.isPublished })} title={p.isPublished ? t("�নপাবলিশ", "Unpublish") : t("পাবলিশ", "Publish")}>
                      {p.isPublished ? <EyeOff className="h-4 w-4 text-warning-700" /> : <Eye className="h-4 w-4 text-success-700" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(p.id); }} title={t("মুছুন", "Delete")}>
                      <Trash2 className="h-4 w-4 text-danger-700" />
                    </Button>
                    {p.isPublished && (
                      <a href={`/page/${p.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-ink-100 dark:hover:bg-ink-200">
                        <ExternalLink className="h-4 w-4 text-ink-500" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <PageEditor
          page={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function PageEditor({ page, onClose }: { page: SitePage | null; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isCreate = !page;

  const [form, setForm] = useState({
    slug: page?.slug ?? "",
    titleBn: page?.titleBn ?? "",
    titleEn: page?.titleEn ?? "",
    contentBn: page?.contentBn ?? "",
    contentEn: page?.contentEn ?? "",
    isPublished: page?.isPublished ?? false,
    showInFooter: page?.showInFooter ?? true,
    order: page?.order ?? 0,
    seoTitle: page?.seoTitle ?? "",
    seoDescription: page?.seoDescription ?? "",
  });

  const save = useMutation({
    mutationFn: () => (isCreate ? api.post("/admin/site-pages", form) : api.patch(`/admin/site-pages/${page!.id}`, form)),
    onSuccess: () => {
      toast.success(t("পেজ সংরক্�িত", "Page saved"));
      qc.invalidateQueries({ queryKey: ["admin", "site-pages"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <Modal title={isCreate ? t("নতুন পেজ", "New Page") : t("পেজ সম্পাদনা", "Edit Page")} onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Slug" hint={t("URL: /page/{slug}", "URL: /page/{slug}")}>
          <Input value={form.slug} onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="privacy" />
        </Field>
        <Field label={t("অর্ডার (ফুটার)", "Order (footer)")}>
          <Input type="number" value={form.order} onChange={(e) => setForm((s) => ({ ...s, order: Number(e.target.value) }))} />
        </Field>
        <Field label={t("টাইটেল (বাংলা)", "Title (BN)")}>
          <Input value={form.titleBn} onChange={(e) => setForm((s) => ({ ...s, titleBn: e.target.value }))} />
        </Field>
        <Field label={t("টাইটেল (EN)", "Title (EN)")}>
          <Input value={form.titleEn} onChange={(e) => setForm((s) => ({ ...s, titleEn: e.target.value }))} />
        </Field>
        <Field label={t("কন্টেন্ট (বাংলা)", "Content (BN)")} hint={t("HTML বা মার্কডাউন সাপোর্ট করে", "HTML or markdown supported")} className="md:col-span-2">
          <textarea
            value={form.contentBn}
            onChange={(e) => setForm((s) => ({ ...s, contentBn: e.target.value }))}
            rows={8}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-xs dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
          />
        </Field>
        <Field label={t("কন্টেন্ট (EN)", "Content (EN)")} className="md:col-span-2">
          <textarea
            value={form.contentEn}
            onChange={(e) => setForm((s) => ({ ...s, contentEn: e.target.value }))}
            rows={8}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-xs dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
          />
        </Field>
        <Field label="SEO Title" className="md:col-span-2">
          <Input value={form.seoTitle} onChange={(e) => setForm((s) => ({ ...s, seoTitle: e.target.value }))} />
        </Field>
        <Field label="SEO Description" className="md:col-span-2">
          <textarea
            value={form.seoDescription}
            onChange={(e) => setForm((s) => ({ ...s, seoDescription: e.target.value }))}
            rows={2}
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
          />
        </Field>
        <Field label={t("প্রকাশিত?", "Published?")}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((s) => ({ ...s, isPublished: e.target.checked }))} className="h-4 w-4 rounded border-ink-300 text-primary-700" />
            <span className="text-sm">{t("পাবলিক সাইটে দেখাবে", "Visible on public site")}</span>
          </label>
        </Field>
        <Field label={t("ফুটারে দেখাবে?", "Show in footer?")}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.showInFooter} onChange={(e) => setForm((s) => ({ ...s, showInFooter: e.target.checked }))} className="h-4 w-4 rounded border-ink-300 text-primary-700" />
            <span className="text-sm">{t("ফুটার লিংক হিসেবে দেখাবে", "Show as footer link")}</span>
          </label>
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.slug}>
          <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ হচ্ছে...", "Saving...") : t("সংরক্ষণ", "Save")}
        </Button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 dark:border-ink-300 dark:bg-ink-50">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4">{children}</div>
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
