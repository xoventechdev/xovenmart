"use client";

import { useRef, useState } from "react";
import { ImageIcon, Upload, Library, Link2, X, Star, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MediaPickerDialog, type MediaLibraryImage } from "./media-picker-dialog";

/**
 * One image attached to a product — either loaded from the DB on edit
 * (id != null) or freshly added in this session (id == null).
 *
 * `source` is a UI-only hint so we render data: URLs with a plain
 * `<img>` (the Next.js image proxy adds no value for inline base64)
 * and external URLs with `<Image unoptimized>` (the host whitelist +
 * onError fallback we shipped for the category icon bug).
 */
export interface ProductImageItem {
  id: string | null;
  url: string;
  altBn: string;
  altEn: string;
  source: "uploaded" | "library" | "url";
  sortOrder: number;
}

interface Props {
  value: ProductImageItem[];
  onChange: (next: ProductImageItem[]) => void;
}

const MAX_IMAGES = 20;
const URL_RE = /^https?:\/\/\S+/i;

/**
 * The "Images" card on the product create/edit form. Three ways to add
 * an image:
 *   1. Upload a file → reads as base64, prefixed with `data:` — stored
 *      as a data URL on the `ProductImage.url` column.
 *   2. Pick from media library → opens the multi-select picker,
 *      appends each chosen image's URL as-is.
 *   3. Paste URL → validates `^https?://`, appends the trimmed URL.
 *
 * Thumbnail grid below shows each image with alt-text inputs, a
 * "set as primary" star button (re-orders to sortOrder 0), and an X
 * delete button. Order changes are immediate via `onChange`.
 *
 * Hard cap at 20 images — matches the backend validator and matches
 * typical e-commerce gallery sizes.
 */
export function ProductImagesCard({ value, onChange }: Props) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const fileRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const atCap = value.length >= MAX_IMAGES;
  const nextSort = value.length;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const additions: ProductImageItem[] = [];
      for (let i = 0; i < files.length && value.length + additions.length < MAX_IMAGES; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          toast.error(
            t(
              `${file.name} — শুধু ছবি ফাইল গ্রহণযোগ্য`,
              `${file.name} — only image files are accepted`,
            ),
          );
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        additions.push({
          id: null,
          url: dataUrl,
          altBn: "",
          altEn: file.name.replace(/\.[^.]+$/, ""),
          source: "uploaded",
          sortOrder: nextSort + additions.length,
        });
      }
      if (additions.length > 0) {
        onChange([...value, ...additions]);
      }
    } catch (e) {
      toast.error(t("আপলোড ব্যর্থ", "Upload failed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!URL_RE.test(trimmed)) {
      toast.error(
        t(
          "শুধু http(s) URL গ্রহণযোগ্য",
          "Only http(s) URLs are accepted",
        ),
      );
      return;
    }
    if (trimmed.length > 2048) {
      toast.error(t("URL অনেক বড়", "URL is too long"));
      return;
    }
    if (value.some((v) => v.url === trimmed)) {
      toast.error(t("এই URL ইতিমধ্যে আছে", "This URL is already added"));
      return;
    }
    onChange([
      ...value,
      {
        id: null,
        url: trimmed,
        altBn: "",
        altEn: "",
        source: "url",
        sortOrder: nextSort,
      },
    ]);
    setUrlInput("");
  };

  const addFromLibrary = (chosen: MediaLibraryImage[]) => {
    if (chosen.length === 0) return;
    const room = MAX_IMAGES - value.length;
    const accepted = chosen.slice(0, room);
    const skipped = chosen.length - accepted.length;
    if (skipped > 0) {
      toast.warning(
        t(
          `${skipped}টি বাদ দেওয়া হয়েছে — সর্বোচ্চ ${MAX_IMAGES}টি`,
          `${skipped} skipped — max ${MAX_IMAGES} images`,
        ),
      );
    }
    const additions: ProductImageItem[] = accepted.map((im, i) => ({
      id: null,
      url: im.url,
      altBn: im.altBn ?? "",
      altEn: im.altEn ?? "",
      source: "library",
      sortOrder: value.length + i,
    }));
    onChange([...value, ...additions]);
  };

  const setPrimary = (idx: number) => {
    if (idx === 0) return;
    const next = [...value];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    onChange(next.map((im, i) => ({ ...im, sortOrder: i })));
  };

  const remove = (idx: number) => {
    const next = value.filter((_, i) => i !== idx);
    onChange(next.map((im, i) => ({ ...im, sortOrder: i })));
  };

  const updateAlt = (idx: number, lang: "bn" | "en", text: string) => {
    const next = value.map((im, i) =>
      i === idx ? { ...im, [lang === "bn" ? "altBn" : "altEn"]: text } : im,
    );
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> {t("ছবি", "Images")}
          </span>
          <Badge variant="muted" className="font-mono text-xs">
            {value.length}/{MAX_IMAGES}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3 sm:p-4">
        {/* Action buttons + URL input */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={atCap || uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("আপলোড", "Upload")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={atCap}
            onClick={() => setPickerOpen(true)}
          >
            <Library className="h-4 w-4" />
            {t("লাইব্রেরি থেকে", "From library")}
          </Button>
          <div className="flex flex-1 items-center gap-1">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                placeholder={t(
                  "বাহ্যিক ছবির URL পেস্ট করুন",
                  "Paste external image URL",
                )}
                disabled={atCap}
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={atCap || !urlInput.trim()}
              onClick={addUrl}
            >
              {t("যোগ", "Add")}
            </Button>
          </div>
        </div>

        {/* Thumbnail grid OR empty state */}
        {value.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-ink-200 bg-ink-50 py-10 text-center dark:border-ink-300 dark:bg-ink-100">
            <ImageIcon className="h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500">
              {t(
                "কোন ছবি নেই — উপরের বাটন ব্যবহার করে যোগ করুন",
                "No images yet — use the buttons above to add some",
              )}
            </p>
            <p className="text-xs text-ink-400">
              {t(
                "আপলোড, লাইব্রেরি, বা যেকোনো বাহ্যিক URL",
                "Upload, library, or any external URL",
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {value.map((im, idx) => (
              <ImageTile
                key={`${im.id ?? "new"}-${idx}`}
                im={im}
                isPrimary={idx === 0}
                t={t}
                onSetPrimary={() => setPrimary(idx)}
                onRemove={() => remove(idx)}
                onAltChange={(lang, text) => updateAlt(idx, lang, text)}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-ink-500">
          {t(
            `প্রথম ছবিটি প্রধান — প্রোডাক্ট পেজ ও কার্ডে দেখানো হবে। ` +
              `সর্বোচ্চ ${MAX_IMAGES}টি ছবি যোগ করা যাবে।`,
            `The first image is the primary — used on the product page and cards. ` +
              `Up to ${MAX_IMAGES} images can be added.`,
          )}
        </p>
      </CardContent>

      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={addFromLibrary}
      />
    </Card>
  );
}

function ImageTile({
  im,
  isPrimary,
  t,
  onSetPrimary,
  onRemove,
  onAltChange,
}: {
  im: ProductImageItem;
  isPrimary: boolean;
  t: (bn: string, en: string) => string;
  onSetPrimary: () => void;
  onRemove: () => void;
  onAltChange: (lang: "bn" | "en", text: string) => void;
}) {
  // For data: URLs use plain <img> — the Next.js image proxy can't add
  // value for inline base64 and adding it just costs a round-trip.
  // For external URLs fall through to the public-site pattern
  // (`unoptimized` skips the proxy entirely so any host works, and the
  // onError handler will be added when we promote to Next/Image below).
  const isDataUrl = im.url.startsWith("data:");

  return (
    <div className="overflow-hidden rounded-md border border-ink-200 bg-white dark:border-ink-300 dark:bg-ink-50">
      <div className="relative aspect-square overflow-hidden bg-ink-100 dark:bg-ink-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={im.url}
          alt={im.altEn || im.altBn || ""}
          className="h-full w-full object-cover"
          // Plain <img> doesn't proxy through /_next/image, so it works
          // for any host without needing the `remotePatterns` whitelist.
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
        {/* Source chip (uploaded / library / url) */}
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {im.source === "uploaded"
            ? t("আপলোড", "Upload")
            : im.source === "library"
              ? t("লাইব্রেরি", "Library")
              : "URL"}
        </span>
        <div className="absolute right-1 top-1 flex gap-1">
          <button
            type="button"
            onClick={onSetPrimary}
            disabled={isPrimary}
            title={isPrimary ? t("প্রধান", "Primary") : t("প্রধান করুন", "Set as primary")}
            className={
              "flex h-7 w-7 items-center justify-center rounded-full text-xs shadow-sm " +
              (isPrimary
                ? "bg-accent-500 text-white"
                : "bg-white/90 text-ink-500 hover:bg-white")
            }
          >
            <Star className={"h-3.5 w-3.5 " + (isPrimary ? "fill-white" : "")} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title={t("মুছুন", "Remove")}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-ink-500 shadow-sm hover:bg-white hover:text-danger-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="space-y-1.5 p-2">
        <input
          type="text"
          value={im.altEn}
          onChange={(e) => onAltChange("en", e.target.value)}
          placeholder={t("Alt (EN)", "Alt (EN)")}
          className="w-full rounded border border-ink-200 bg-white px-2 py-1 text-xs dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
        />
        <input
          type="text"
          value={im.altBn}
          onChange={(e) => onAltChange("bn", e.target.value)}
          placeholder={t("অল্ট (বাংলা)", "Alt (BN)")}
          className="w-full rounded border border-ink-200 bg-white px-2 py-1 text-xs dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
        />
      </div>
    </div>
  );
}
