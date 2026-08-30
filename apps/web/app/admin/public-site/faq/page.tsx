"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, HelpCircle, X, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Faq {
  id: string;
  category: string;
  questionBn: string;
  questionEn: string;
  answerBn: string;
  answerEn: string;
  isPublished: boolean;
  sortOrder: number;
}

export default function FaqPageEditor() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: faqs, isLoading } = useQuery({
    queryKey: ["admin", "faqs"],
    queryFn: () => api.get("/admin/faqs"),
  });

  const [editing, setEditing] = useState<Faq | null>(null);
  const [creating, setCreating] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("");

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/faqs/${id}`),
    onSuccess: () => {
      toast.success(t("FAQ মুছে ফেলা হয়েছে", "FAQ deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
    },
  });

  const categories = Array.from(new Set(((faqs as Faq[]) ?? []).map((f) => f.category)));
  const filtered = filterCat ? (faqs as Faq[]).filter((f) => f.category === filterCat) : (faqs as Faq[]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("FAQ ম্যানেজার", "FAQ Manager")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{t("প্রায়শই জিজ্ঞাসিত প্রশ্নোত্তর পরিচালনা করুন", "Manage FAQ entries")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন FAQ", "New FAQ")}
        </Button>
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCat("")}
            className={`rounded-full px-3 py-1 text-xs ${!filterCat ? "bg-primary-700 text-white" : "bg-ink-100 text-ink-700 dark:bg-ink-700 dark:text-ink-100"}`}
          >
            {t("সব", "All")}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`rounded-full px-3 py-1 text-xs ${filterCat === c ? "bg-primary-700 text-white" : "bg-ink-100 text-ink-700 dark:bg-ink-700 dark:text-ink-100"}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-2 p-3">
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন FAQ নেই", "No FAQs yet")}</p>
          ) : (
            filtered.map((f) => (
              <div key={f.id} className="rounded-md border border-ink-200 p-3 dark:border-ink-300">
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted">{f.category}</Badge>
                      {!f.isPublished && <Badge variant="warning">{t("ড্রাফট", "Draft")}</Badge>}
                    </div>
                    <div className="mt-1 font-semibold text-ink-900 dark:text-ink-900">
                      {lang === "bn" ? f.questionBn : f.questionEn}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                      {lang === "bn" ? f.answerBn : f.answerEn}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(f)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(f.id); }}><Trash2 className="h-4 w-4 text-danger-700" /></Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {(editing || creating) && <FaqEditor faq={editing} onClose={() => { setEditing(null); setCreating(false); }} />}
    </div>
  );
}

function FaqEditor({ faq, onClose }: { faq: Faq | null; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isCreate = !faq;

  const [form, setForm] = useState({
    category: faq?.category ?? "general",
    questionBn: faq?.questionBn ?? "",
    questionEn: faq?.questionEn ?? "",
    answerBn: faq?.answerBn ?? "",
    answerEn: faq?.answerEn ?? "",
    isPublished: faq?.isPublished ?? true,
    sortOrder: faq?.sortOrder ?? 0,
  });

  const save = useMutation({
    mutationFn: () => (isCreate ? api.post("/admin/faqs", form) : api.patch(`/admin/faqs/${faq!.id}`, form)),
    onSuccess: () => {
      toast.success(t("FAQ সংরক্ষিত", "FAQ saved"));
      qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 dark:border-ink-300 dark:bg-ink-50">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{isCreate ? t("নতুন FAQ", "New FAQ") : t("FAQ সম্পাদনা", "Edit FAQ")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("ক্যাটাগরি", "Category")}</label>
              <Input value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} placeholder="ordering, delivery, payment, returns..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("অর্ডার", "Sort Order")}</label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm((s) => ({ ...s, sortOrder: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("প্রশ্ন (বাংলা)", "Question (BN)")}</label>
              <Input value={form.questionBn} onChange={(e) => setForm((s) => ({ ...s, questionBn: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("প্রশ্ন (EN)", "Question (EN)")}</label>
              <Input value={form.questionEn} onChange={(e) => setForm((s) => ({ ...s, questionEn: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("উত্তর (বাংলা)", "Answer (BN)")}</label>
              <textarea value={form.answerBn} onChange={(e) => setForm((s) => ({ ...s, answerBn: e.target.value }))} rows={3} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("উত্তর (EN)", "Answer (EN)")}</label>
              <textarea value={form.answerEn} onChange={(e) => setForm((s) => ({ ...s, answerEn: e.target.value }))} rows={3} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900" />
            </div>
            <div className="md:col-span-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((s) => ({ ...s, isPublished: e.target.checked }))} className="h-4 w-4 rounded border-ink-300 text-primary-700" />
                <span className="text-sm">{t("পাবলিক সাইটে দেখাবে", "Show on public site")}</span>
              </label>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-200 bg-white p-3 dark:border-ink-300 dark:bg-ink-50">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
