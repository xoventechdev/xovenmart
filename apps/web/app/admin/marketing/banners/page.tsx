"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Plus, Pencil, Trash2, X, Save, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Banner {
  id: string;
  imageUrl: string;
  mobileImageUrl?: string | null;
  linkUrl?: string | null;
  titleBn?: string | null;
  titleEn?: string | null;
  subtitleBn?: string | null;
  subtitleEn?: string | null;
  position: string;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder: number;
  createdAt: string;
}

const POSITIONS = [
  { value: "homepage_hero", bn: "হোমপেজ হিরো", en: "Homepage Hero" },
  { value: "homepage_middle", bn: "হোমপেজ মাঝে", en: "Homepage Middle" },
  { value: "deals_page", bn: "ডিল পেজ", en: "Deals Page" },
];

export default function BannersPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: banners, isLoading } = useQuery({
    queryKey: ["admin", "marketing", "banners"],
    queryFn: () => api.get("/admin/marketing/banners"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/marketing/banners/${id}`),
    onSuccess: () => {
      toast.success(t("মুছে ফেলা হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "marketing", "banners"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/marketing/banners/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "marketing", "banners"] }),
  });

  const list: Banner[] = (banners ?? []) as any;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("ব্যানার", "Banners")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("হোমপেজ ও ডিল পেজের ব্যানার পরিচালনা করুন", "Manage homepage and deals page banners")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t("নতুন ব্যানার", "New Banner")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}</div>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-500">{t("কোন ব্যানার নেই", "No banners yet")}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => {
            const pos = POSITIONS.find((p) => p.value === b.position);
            return (
              <Card key={b.id}>
                <div className="relative h-32 overflow-hidden rounded-t-md bg-ink-100 dark:bg-ink-200">
                  <img src={b.imageUrl} alt={b.titleEn ?? "banner"} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <Badge variant={b.isActive ? "success" : "muted"} className="absolute right-2 top-2">{b.isActive ? t("সক্রিয়", "Active") : t("নিষ্ক্রিয়", "Inactive")}</Badge>
                </div>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-primary-700" />
                    <span className="text-sm font-semibold">{b.titleEn ?? b.titleBn ?? <span className="text-ink-400">—</span>}</span>
                  </div>
                  <Badge variant="outline">{pos ? t(pos.bn, pos.en) : b.position}</Badge>
                  {b.linkUrl && <div className="line-clamp-1 text-xs text-info-700">{b.linkUrl}</div>}
                  <div className="flex gap-1 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate({ id: b.id, isActive: !b.isActive })}>
                      {b.isActive ? t("বন্ধ করুন", "Disable") : t("চালু করুন", "Enable")}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(b)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(t("মুছে ফেলবেন?", "Delete?"))) remove.mutate(b.id); }}><Trash2 className="h-3 w-3 text-danger-700" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(editing || creating) && (
        <BannerEditor banner={editing} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}

function BannerEditor({ banner, onClose }: { banner: Banner | null; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isCreate = !banner;

  const [form, setForm] = useState({
    imageUrl: banner?.imageUrl ?? "",
    mobileImageUrl: banner?.mobileImageUrl ?? "",
    linkUrl: banner?.linkUrl ?? "",
    titleBn: banner?.titleBn ?? "",
    titleEn: banner?.titleEn ?? "",
    subtitleBn: banner?.subtitleBn ?? "",
    subtitleEn: banner?.subtitleEn ?? "",
    position: banner?.position ?? "homepage_hero",
    isActive: banner?.isActive ?? true,
    startsAt: banner?.startsAt ? banner.startsAt.slice(0, 10) : "",
    endsAt: banner?.endsAt ? banner.endsAt.slice(0, 10) : "",
    sortOrder: banner?.sortOrder ?? 0,
  });

  const save = useMutation({
    mutationFn: () => (isCreate ? api.post("/admin/marketing/banners", form) : api.patch(`/admin/marketing/banners/${banner!.id}`, form)),
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "marketing", "banners"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Save failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 dark:border-ink-300 dark:bg-ink-50">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{isCreate ? t("নতুন ব্যানার", "New Banner") : t("ব্যানার সম্পাদনা", "Edit Banner")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("ছবির URL", "Image URL")}</label>
            <Input value={form.imageUrl} onChange={(e) => setForm((s) => ({ ...s, imageUrl: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("শিরোনাম (বাংলা)", "Title (BN)")}</label>
              <Input value={form.titleBn} onChange={(e) => setForm((s) => ({ ...s, titleBn: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("শিরোনাম (EN)", "Title (EN)")}</label>
              <Input value={form.titleEn} onChange={(e) => setForm((s) => ({ ...s, titleEn: e.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">{t("লিংক", "Link URL")}</label>
              <Input value={form.linkUrl} onChange={(e) => setForm((s) => ({ ...s, linkUrl: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("পজিশন", "Position")}</label>
              <select value={form.position} onChange={(e) => setForm((s) => ({ ...s, position: e.target.value }))} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
                {POSITIONS.map((p) => <option key={p.value} value={p.value}>{t(p.bn, p.en)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("অর্ডার", "Sort Order")}</label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm((s) => ({ ...s, sortOrder: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("শুরু", "Starts At")}</label>
              <Input type="date" value={form.startsAt} onChange={(e) => setForm((s) => ({ ...s, startsAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("শেষ", "Ends At")}</label>
              <Input type="date" value={form.endsAt} onChange={(e) => setForm((s) => ({ ...s, endsAt: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} className="h-4 w-4 rounded border-ink-300 text-primary-700" />
                <span className="text-sm">{t("সক্রিয়", "Active")}</span>
              </label>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-200 bg-white p-3 dark:border-ink-300 dark:bg-ink-50">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.imageUrl}>
            <Save className="h-4 w-4" /> {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
