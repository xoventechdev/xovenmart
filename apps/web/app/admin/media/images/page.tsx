"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Upload, Trash2, Edit3, Save, X, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface MediaImage {
  id: string;
  productId: string;
  productName: string | null;
  url: string;
  altBn: string | null;
  altEn: string | null;
  sortOrder: number;
  createdAt: string;
}

export default function MediaImagesPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [editing, setEditing] = useState<MediaImage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "media", "images"],
    queryFn: () => api.get("/admin/media/images?perPage=200"),
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "media", "stats"],
    queryFn: () => api.get("/admin/media/stats"),
  });

  const items: MediaImage[] = ((data as any)?.items ?? []) as any;

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/media/images/${id}`),
    onSuccess: () => {
      toast.success(t("ডিলিট হয়েছে", "Deleted"));
      qc.invalidateQueries({ queryKey: ["admin", "media"] });
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Delete failed"),
  });

  const handleUpload = async (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.post("/admin/media/upload", {
          filename: file.name,
          contentType: file.type,
          dataBase64: reader.result as string,
          productId: undefined, // would need to prompt for product
        });
        toast.success(t("আপলোড হয়েছে", "Uploaded"));
        qc.invalidateQueries({ queryKey: ["admin", "media"] });
      } catch (e: any) {
        toast.error(e?.data?.message ?? "Upload failed");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("মিডিয়া লাইব্রেরি", "Media Library")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("সব ছবি দেখুন, আপলোড ও পরিচালনা করুন", "View, upload, and manage images")}</p>
        </div>
        <div>
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {t("দ্রুত আপলোড", "Quick Upload")}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label={t("মোট", "Total")} value={String(stats.totalImages)} icon={ImageIcon} t={t} />
          {Object.entries(stats.byType ?? {}).slice(0, 3).map(([k, v]) => (
            <StatCard key={k} label={k.toUpperCase()} value={String(v)} icon={ImageIcon} t={t} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" /> {t("ছবি", "Images")} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => <div key={i} className="aspect-square animate-pulse rounded bg-ink-100 dark:bg-ink-200" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">{t("কোন ছবি নেই", "No images yet")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {items.map((img) => (
                <div key={img.id} className="group relative overflow-hidden rounded-md border border-ink-200 dark:border-ink-300">
                  <div className="aspect-square overflow-hidden bg-ink-100 dark:bg-ink-200">
                    <img src={img.url} alt={img.altEn ?? ""} className="h-full w-full object-cover transition-transform group-hover:scale-105" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <p className="line-clamp-1 text-xs text-white">{img.productName ?? t("অজানা পণ্য", "Unattached")}</p>
                    <p className="line-clamp-1 text-[10px] text-white/70">{img.altEn ?? img.altBn ?? "—"}</p>
                  </div>
                  <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="icon" variant="ghost" className="h-7 w-7 bg-white/90" onClick={() => setEditing(img)}>
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 bg-white/90" onClick={() => { if (confirm(t("ডিলিট করবেন?", "Delete?"))) remove.mutate(img.id); }}>
                      <Trash2 className="h-3 w-3 text-danger-700" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && <EditAlt image={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditAlt({ image, onClose }: { image: MediaImage; onClose: () => void }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [altBn, setAltBn] = useState(image.altBn ?? "");
  const [altEn, setAltEn] = useState(image.altEn ?? "");

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/media/images/${image.id}`, { altBn, altEn }),
    onSuccess: () => {
      toast.success(t("আপডেট হয়েছে", "Updated"));
      qc.invalidateQueries({ queryKey: ["admin", "media"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Update failed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50">
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold text-ink-900 dark:text-ink-900">{t("অল্ট টেক্সট", "Alt text")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="aspect-square w-full overflow-hidden rounded bg-ink-100 dark:bg-ink-200">
            <img src={image.url} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("অল্ট (বাংলা)", "Alt (BN)")}</label>
            <Input value={altBn} onChange={(e) => setAltBn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("অল্ট (EN)", "Alt (EN)")}</label>
            <Input value={altEn} onChange={(e) => setAltEn(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>{t("বাতিল", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="h-4 w-4" /> {t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, t }: { label: string; value: string; icon: any; t: (b: string, e: string) => string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs text-ink-500">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}