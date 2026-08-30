"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Image as ImageIcon, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Product {
  id: string;
  nameEn: string;
  nameBn: string;
  sku: string;
}

export default function UploadMediaPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [altBn, setAltBn] = useState("");
  const [altEn, setAltEn] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const { data: productsData } = useQuery({
    queryKey: ["admin", "products", "list"],
    queryFn: () => api.get("/admin/products?perPage=200"),
  });
  const products: Product[] = ((productsData as any)?.items ?? []) as any;

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("no file");
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await api.post("/admin/media/upload", {
              filename: file.name,
              contentType: file.type,
              dataBase64: reader.result,
              productId,
              altBn: altBn || undefined,
              altEn: altEn || undefined,
            });
            resolve(res);
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      toast.success(t("আপলোড সফল", "Upload successful"));
      qc.invalidateQueries({ queryKey: ["admin", "media"] });
      // Reset
      setFile(null);
      setPreview(null);
      setAltBn("");
      setAltEn("");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => toast.error(e?.data?.message ?? e?.message ?? "Upload failed"),
  });

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error(t("শুধু ছবি ফাইল গ্রহণযোগ্য", "Only image files are accepted"));
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">{t("মিডিয়া আপলোড", "Upload Media")}</h1>
        <p className="mt-1 text-sm text-ink-500">{t("পণ্যের ছবি আপলোড করুন", "Upload product images")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" /> {t("নতুন আপলোড", "New Upload")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors ${dragOver ? "border-primary-700 bg-primary-50" : "border-ink-300 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"}`}
          >
            {preview ? (
              <div className="w-full max-w-xs space-y-2">
                <img src={preview} alt="preview" className="aspect-square w-full rounded-md object-cover" />
                <div className="flex items-center justify-center gap-2 text-xs text-ink-500">
                  <ImageIcon className="h-3 w-3" /> {file?.name} ({Math.round((file?.size ?? 0) / 1024)} KB)
                </div>
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}>
                  <X className="h-3 w-3" /> {t("মুছুন", "Remove")}
                </Button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-ink-400" />
                <p className="mt-2 text-sm font-medium">{t("ছবি টানে আনুন বা ক্লিক করুন", "Drop image or click to browse")}</p>
                <p className="mt-1 text-xs text-ink-500">PNG, JPG, WebP up to 10MB</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {/* Form fields */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("পণ্য", "Product")}</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900">
                <option value="">{t("— পণ্য বাছুন —", "— Select product —")}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.nameEn} ({p.sku})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("অল্ট (বাংলা)", "Alt (BN)")}</label>
              <Input value={altBn} onChange={(e) => setAltBn(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">{t("অল্ট (EN)", "Alt (EN)")}</label>
              <Input value={altEn} onChange={(e) => setAltEn(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-ink-200 pt-3 dark:border-ink-300">
            <p className="mr-auto self-center text-xs text-ink-500">{t("দ্রষ্টব্য: ডে-১ এ ছবি base64 হিসেবে সংরক্ষিত হবে।", "Note: Day-1 stores images as base64 data URLs.")}</p>
            <Button onClick={() => upload.mutate()} disabled={upload.isPending || !file || !productId}>
              <Save className="h-4 w-4" /> {upload.isPending ? t("আপলোড হচ্ছে...", "Uploading...") : t("আপলোড", "Upload")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}