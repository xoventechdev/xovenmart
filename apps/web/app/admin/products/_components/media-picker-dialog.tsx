"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Check, ImageIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

/**
 * One row from `/api/v1/admin/media/images`. The backend serializes
 * images as `{ id, productId, productName, url, altBn, altEn, sortOrder,
 * createdAt }` (see `AdminMediaController.toDto`).
 */
export interface MediaLibraryImage {
  id: string;
  productId: string;
  productName: string | null;
  url: string;
  altBn: string | null;
  altEn: string | null;
  sortOrder: number;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen images (already filtered — only the
   *  admin-selected ones). Caller is responsible for merging them
   *  into the product's `images[]` state. */
  onConfirm: (chosen: MediaLibraryImage[]) => void;
}

/**
 * "Pick from library" modal — lets the admin multi-select existing
 * media-library images to attach to a product. Fetches up to 200 images
 * in one shot (the same call the standalone /admin/media/images page
 * uses). Local search box filters client-side by alt text + productName
 * since we don't need pagination for that scale.
 *
 * Selection state is local; nothing is mutated until the admin hits
 * "Add selected (N)". Empty selection → button disabled.
 */
export function MediaPickerDialog({ open, onClose, onConfirm }: Props) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "media", "images", "picker"],
    queryFn: () => api.get("/admin/media/images?perPage=200"),
    enabled: open,
    // Don't refetch on every focus — the library list rarely changes
    // mid-edit and we want the picker to feel snappy.
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const items: MediaLibraryImage[] = ((data as any)?.items ?? []) as any;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((im) => {
      return (
        (im.altEn ?? "").toLowerCase().includes(q) ||
        (im.altBn ?? "").toLowerCase().includes(q) ||
        (im.productName ?? "").toLowerCase().includes(q) ||
        im.url.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const chosen = items.filter((im) => selected.has(im.id));
    onConfirm(chosen);
    // Reset selection so the next open starts clean
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("মিডিয়া লাইব্রেরি থেকে নির্বাচন", "Pick from media library")}
      className="max-w-3xl"
    >
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("অল্ট টেক্সট বা URL খুঁজুন", "Search alt text or URL")}
            className="pl-9"
          />
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-md bg-ink-100 dark:bg-ink-200"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-ink-500">
            <ImageIcon className="h-8 w-8 text-ink-300" />
            <p>{t("কোন ছবি পাওয়া যায়নি", "No images found")}</p>
            <p className="text-xs">
              {t(
                "প্রথমে মিডিয়া পেজে ছবি আপলোড করুন",
                "Upload images on the media page first",
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
            {filtered.map((im) => {
              const isSelected = selected.has(im.id);
              return (
                <button
                  key={im.id}
                  type="button"
                  onClick={() => toggle(im.id)}
                  aria-pressed={isSelected}
                  aria-label={
                    im.altEn || im.altBn || im.productName || im.url
                  }
                  className={
                    "group relative aspect-square overflow-hidden rounded-md border-2 transition " +
                    (isSelected
                      ? "border-primary-700 ring-2 ring-primary-500/30"
                      : "border-ink-200 hover:border-primary-400 dark:border-ink-300")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={im.url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.opacity = "0.2";
                    }}
                  />
                  {/* Selection check overlay */}
                  <span
                    className={
                      "absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold " +
                      (isSelected
                        ? "bg-primary-700 text-white"
                        : "bg-white/80 text-ink-500 opacity-0 group-hover:opacity-100")
                    }
                  >
                    {isSelected ? <Check className="h-4 w-4" /> : "+"}
                  </span>
                  {/* Alt / product label */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <p className="line-clamp-1 text-[10px] font-medium text-white">
                      {im.altEn || im.altBn || im.productName || "—"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-ink-200 pt-3 dark:border-ink-300">
          <p className="text-xs text-ink-500">
            {selected.size > 0
              ? t(
                  `${selected.size}টি নির্বাচিত`,
                  `${selected.size} selected`,
                )
              : t("এক বা একাধিক ছবি নির্বাচন করুন", "Select one or more images")}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              {t("বাতিল", "Cancel")}
            </Button>
            <Button onClick={handleConfirm} disabled={selected.size === 0}>
              {t(
                `যোগ করুন (${selected.size})`,
                `Add selected (${selected.size})`,
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
