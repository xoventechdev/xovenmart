"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  CheckCircle,
  XCircle,
  DollarSign,
  Truck,
  RefreshCw,
  Zap,
  Map as MapIcon,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";

// SSR-safe Leaflet wrapper — Leaflet requires window/document at import time
const ZonePreviewMap = dynamic(() => import("@/components/map/zone-preview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-ink-100 dark:bg-ink-200">
      <span className="text-xs text-ink-500">ম্যাপ লোড হচ্ছে… / Loading map…</span>
    </div>
  ),
});

interface DeliveryZone {
  id: string;
  nameBn: string;
  nameEn: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  baseKm: number;
  baseFee: number;
  perKmFee: number;
  perKgFee: number;
  heavyKgThreshold: number | null;
  heavyKgFee: number | null;
  freeAbove: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function DeliveryZonesPage() {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");
  const [hideInactive, setHideInactive] = useState(false);
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: zones, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "delivery-zones"],
    queryFn: () => api.get("/admin/delivery-zones"),
  });

  const toggleActive = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) =>
      api.patch(`/admin/delivery-zones/${vars.id}`, { isActive: vars.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "delivery-zones"] }),
    onError: (e: any) => toast.error(e?.data?.message ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/delivery-zones/${id}`),
    onSuccess: () => {
      toast.success(t("জোন নিষ্ক্রিয় করা হয়েছে", "Zone deactivated"));
      qc.invalidateQueries({ queryKey: ["admin", "delivery-zones"] });
    },
    onError: (e: any) => {
      const msg =
        e?.data?.message?.toString?.() ??
        (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ??
        (e?.status === 403
          ? t("আপনার অনুমতি নেই (শুধু অ্যাডমিন)", "Permission denied (admin only)")
          : null) ??
        t("মুছে ফেলা ব্যর্থ", "Delete failed");
      toast.error(msg);
    },
  });

  const recalc = useMutation({
    mutationFn: () => api.post("/admin/delivery-zones/recalculate-fees", {}),
    onSuccess: (res: any) => {
      toast.success(
        t(
          `${res.updated ?? 0} টি পেন্ডিং অর্ডারের ফি আপডেট হয়েছে`,
          `Recalculated ${res.updated ?? 0} pending orders`,
        ),
      );
    },
    onError: (e: any) => toast.error(e?.data?.message ?? "Recalculation failed"),
  });

  const list: DeliveryZone[] = (zones ?? []) as any;

  const filtered = list.filter((z) => {
    const q = search.trim().toLowerCase();
    if (hideInactive && !z.isActive) return false;
    if (!q) return true;
    return z.nameBn.toLowerCase().includes(q) || z.nameEn.toLowerCase().includes(q);
  });

  const activeCount = list.filter((z) => z.isActive).length;
  const avgBase = list.length === 0 ? 0 : list.reduce((s, z) => s + z.baseFee, 0) / list.length;
  const avgPerKm = list.length === 0 ? 0 : list.reduce((s, z) => s + z.perKmFee, 0) / list.length;
  const freeDeliveryZones = list.filter((z) => z.freeAbove != null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
            {t("ডেলিভারি জোন", "Delivery Zones")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "দূরত্ব-ভিত্তিক ফি + ওজন সারচার্� + ফ্রি ডেলিভারি থ্রেশহোল্ড",
              "Distance-based fee + weight surcharge + free-delivery threshold per zone",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/delivery-zones/fees">
            <Button variant="outline">
              <DollarSign className="h-4 w-4" /> {t("ফি স্ট্রাকচার", "Fee Structure")}
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  t(
                    "সব পেন্ডিং অর্ডারের ডেলিভারি ফি রিসেট করবেন?",
                    "Recalculate delivery fees for all pending orders?",
                  ),
                )
              )
                recalc.mutate();
            }}
            disabled={recalc.isPending}
            title={t("পেন্ডিং অর্ডারগুলোর ফি হিসাব করুন", "Recalculate fees on pending orders")}
          >
            <Zap className="h-4 w-4" /> {t("ফি রিক্যালকুলেট", "Recalculate Fees")}
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> {t("রিফ্রেশ", "Refresh")}
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t("নতুন জোন", "Add Zone")}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<MapPin className="h-5 w-5" />}
          tone="primary"
          label={t("মোট জোন", "Total Zones")}
          value={list.length}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5" />}
          tone="success"
          label={t("সক্রিয়", "Active")}
          value={activeCount}
        />
        <StatCard
          icon={<Truck className="h-5 w-5" />}
          tone="info"
          label={t("গড় বেস / প্রতি কিমি", "Avg Base / per-km")}
          value={`৳${avgBase.toFixed(0)} + ৳${avgPerKm.toFixed(0)}/km`}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          tone="warning"
          label={t("ফ্রি ডেলিভারি জোন", "Free Delivery Zones")}
          value={freeDeliveryZones}
        />
      </div>

      {/* Search + filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("জোনের নাম দিয়ে খুঁজুন...", "Search by zone name...")}
            className="max-w-xs"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideInactive}
              onChange={(e) => setHideInactive(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-primary-700"
            />
            <span>{t("নিষ্ক্রিয় জোন লুকান", "Hide inactive zones")}</span>
          </label>
          {hideInactive && (
            <Badge variant="muted" className="text-[10px]">
              {list.filter((z) => !z.isActive).length} {t("লুকানো", "hidden")}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" /> {t("জোন তালিকা", "Zone List")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              {t("কোন জোন নেই", "No zones")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-700 dark:bg-ink-100">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("নাম", "Name")}</th>
                    <th className="px-3 py-2 text-left">{t("কেন্দ্র", "Center")}</th>
                    <th className="px-3 py-2 text-right">{t("ম্যাক্স (কিমি)", "Max (km)")}</th>
                    <th className="px-3 py-2 text-right">{t("বেস (কিমি + ৳)", "Base (km + BDT)")}</th>
                    <th className="px-3 py-2 text-right">{t("প্রতি কিমি", "Per km")}</th>
                    <th className="px-3 py-2 text-right">{t("প্রতি কেজি", "Per kg")}</th>
                    <th className="px-3 py-2 text-right">{t("হেভি", "Heavy")}</th>
                    <th className="px-3 py-2 text-right">{t("ফ্রি", "Free")}</th>
                    <th className="px-3 py-2 text-left">{t("�বস্থা", "Status")}</th>
                    <th className="px-3 py-2 text-right">{t("কর্ম", "Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((z) => (
                    <tr
                      key={z.id}
                      className="border-t border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{lang === "bn" ? z.nameBn : z.nameEn}</div>
                        <div className="text-xs text-ink-500">
                          {lang === "bn" ? z.nameEn : z.nameBn}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-ink-700 dark:text-ink-900">
                        {z.centerLat.toFixed(4)}, {z.centerLng.toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {z.radiusKm} {t("কিমি", "km")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <div className="font-semibold">৳{z.baseFee}</div>
                        <div className="text-[10px] text-ink-500">{z.baseKm} km</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">৳{z.perKmFee}/km</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {z.perKgFee > 0 ? `৳${z.perKgFee}/kg` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-ink-700 dark:text-ink-900">
                        {z.heavyKgThreshold != null && z.heavyKgFee != null
                          ? `>${z.heavyKgThreshold}kg → ৳${z.heavyKgFee}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {z.freeAbove != null ? `৳${z.freeAbove}+` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {z.isActive ? (
                          <Badge variant="success">{t("সক্রিয়", "Active")}</Badge>
                        ) : (
                          <Badge variant="muted">{t("নিষ্ক্রিয়", "Inactive")}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(z)} title={t("সম্পাদনা", "Edit")}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleActive.mutate({ id: z.id, isActive: !z.isActive })}
                            disabled={toggleActive.isPending}
                            title={z.isActive ? t("নিষ্ক্রিয়", "Deactivate") : t("সক্রিয়", "Activate")}
                          >
                            {z.isActive ? (
                              <XCircle className="h-4 w-4 text-warning-700" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-success-700" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (
                                confirm(
                                  t(
                                    `"${z.nameEn}" জোন নিষ্ক্রিয় করবেন? এটি আর চেকআউটে ব্যবহার হবে না, তবে ডাটা থাকবে।`,
                                    `Deactivate zone "${z.nameEn}"? It will no longer be used at checkout, but data is preserved.`,
                                  ),
                                )
                              )
                                remove.mutate(z.id);
                            }}
                            disabled={remove.isPending && remove.variables === z.id}
                            title={t("নিষ্ক্রিয় (সফট-ডিলিট)", "Deactivate (soft delete)")}
                          >
                            <Trash2 className="h-4 w-4 text-danger-700" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(editing || creating) && (
        <ZoneEditor
          zone={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function ZoneEditor({
  zone,
  onClose,
}: {
  zone: DeliveryZone | null;
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const isCreate = !zone;

  const [form, setForm] = useState({
    nameBn: zone?.nameBn ?? "",
    nameEn: zone?.nameEn ?? "",
    centerLat: zone?.centerLat ?? 23.4577,
    centerLng: zone?.centerLng ?? 91.1809,
    radiusKm: zone?.radiusKm ?? 5,
    baseKm: zone?.baseKm ?? 1,
    baseFee: zone?.baseFee ?? 30,
    perKmFee: zone?.perKmFee ?? 10,
    perKgFee: zone?.perKgFee ?? 0,
    heavyKgThreshold: zone?.heavyKgThreshold != null ? String(zone.heavyKgThreshold) : "",
    heavyKgFee: zone?.heavyKgFee != null ? String(zone.heavyKgFee) : "",
    freeAbove: zone?.freeAbove != null ? String(zone.freeAbove) : "",
    sortOrder: zone?.sortOrder ?? 0,
    isActive: zone?.isActive ?? true,
  });
  const [showMap, setShowMap] = useState(false);

  // Inline mirror of the radius→zoom helper used by the preview map. Kept here
  // so the "Open OSM" external link can pick a sensible zoom level too.
  const previewZoom = (km: number): number => {
    if (!Number.isFinite(km) || km <= 0) return 13;
    if (km <= 1) return 15;
    if (km <= 3) return 14;
    if (km <= 10) return 12;
    if (km <= 30) return 10;
    if (km <= 100) return 8;
    return 6;
  };

  const save = useMutation({
    mutationFn: () => {
      const body: any = {
        nameBn: form.nameBn,
        nameEn: form.nameEn,
        centerLat: Number(form.centerLat),
        centerLng: Number(form.centerLng),
        radiusKm: Number(form.radiusKm),
        baseKm: Number(form.baseKm),
        baseFee: Number(form.baseFee),
        perKmFee: Number(form.perKmFee),
        perKgFee: Number(form.perKgFee),
        heavyKgThreshold: form.heavyKgThreshold !== "" ? Number(form.heavyKgThreshold) : null,
        heavyKgFee: form.heavyKgFee !== "" ? Number(form.heavyKgFee) : null,
        freeAbove: form.freeAbove !== "" ? Number(form.freeAbove) : null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      return isCreate
        ? api.post("/admin/delivery-zones", body)
        : api.patch(`/admin/delivery-zones/${zone!.id}`, body);
    },
    onSuccess: () => {
      toast.success(t("সংরক্ষিত", "Saved"));
      qc.invalidateQueries({ queryKey: ["admin", "delivery-zones"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.data?.message ?? t("ব্যর্থ", "Save failed")),
  });

  const valid =
    form.nameBn &&
    form.nameEn &&
    Number(form.radiusKm) > 0 &&
    Number(form.baseKm) >= 0 &&
    Number(form.baseFee) >= 0 &&
    Number(form.perKmFee) >= 0 &&
    Number(form.perKgFee) >= 0;

  // Compute preview ladder (0–max km) for current form values
  const ladder: { km: number; fee: number }[] = [];
  {
    const max = Math.min(Number(form.radiusKm) || 0, 10);
    const baseFee = Number(form.baseFee) || 0;
    const baseKm = Number(form.baseKm) || 0;
    const perKmFee = Number(form.perKmFee) || 0;
    for (let km = 1; km <= max; km++) {
      const extra = Math.max(0, Math.ceil(km - baseKm));
      ladder.push({ km, fee: Math.round(baseFee + extra * perKmFee) });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold">
            {isCreate ? t("নতুন জোন", "Add Zone") : t("জোন সম্পাদনা", "Edit Zone")}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 p-4">
          {/* Section: Identity */}
          <Section title={t("পরিচিতি", "Identity")}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("নাম (বা�লা)", "Name (BN)")}>
                <Input
                  value={form.nameBn}
                  onChange={(e) => setForm((s) => ({ ...s, nameBn: e.target.value }))}
                  placeholder={t("যেমন: লক্ষ্মীপুর সদর", "e.g. Laksmipur Sadar")}
                />
              </Field>
              <Field label={t("নাম (English)", "Name (EN)")}>
                <Input
                  value={form.nameEn}
                  onChange={(e) => setForm((s) => ({ ...s, nameEn: e.target.value }))}
                  placeholder="Laksmipur Sadar"
                />
              </Field>
            </div>
          </Section>

          {/* Section: Center & Radius */}
          <Section
            title={t("অবস্থান ও পরিধি", "Location & Radius")}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowMap(true)}
                title={t("ম্যাপে দেখুন", "Preview on map")}
              >
                <MapIcon className="h-4 w-4" /> {t("ম্যাপে দেখুন", "View on map")}
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={t("কেন্�্র অক্ষাংশ", "Center Lat")} hint={t("যেমন: 23.4577", "e.g. 23.4577")}>
                <Input
                  type="number"
                  step="0.0000001"
                  value={form.centerLat}
                  onChange={(e) => setForm((s) => ({ ...s, centerLat: Number(e.target.value) }))}
                />
              </Field>
              <Field label={t("কেন্দ্র দ্রাঘিমা", "Center Lng")} hint={t("�েমন: 91.1809", "e.g. 91.1809")}>
                <Input
                  type="number"
                  step="0.0000001"
                  value={form.centerLng}
                  onChange={(e) => setForm((s) => ({ ...s, centerLng: Number(e.target.value) }))}
                />
              </Field>
              <Field
                label={t("ম্যাক্স রেডিয়াস (কিমি)", "Max radius (km)")}
                hint={t("এর বাইরে হলে ডেলিভারি অসম্ভব", "Outside this, delivery is refused")}
              >
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.radiusKm}
                  onChange={(e) => setForm((s) => ({ ...s, radiusKm: Number(e.target.value) }))}
                />
              </Field>
            </div>
          </Section>

          {/* Section: Distance-based fee */}
          <Section
            title={t("দ�রত্ব-ভিত্তিক ফি", "Distance-based Fee")}
            hint={t(
              "বেস ফি কভার করে প্রথম n কিমি। এর পরে প্রতি কিমি +perKmFee যোগ হবে।",
              "Base fee covers the first N km. Beyond that, +perKmFee per km.",
            )}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={t("বেস কিমি", "Base (km)")} hint={t("যেমন: ১ কিমি", "e.g. 1 km")}>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={form.baseKm}
                  onChange={(e) => setForm((s) => ({ ...s, baseKm: Number(e.target.value) }))}
                />
              </Field>
              <Field label={t("বেস ফি (৳)", "Base fee (BDT)")} hint={t("প্রথম N কিমির জন্য", "Covers first N km")}>
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={form.baseFee}
                  onChange={(e) => setForm((s) => ({ ...s, baseFee: Number(e.target.value) }))}
                />
              </Field>
              <Field label={t("প্রতি কিমি (৳)", "Per-km fee (BDT)")} hint={t("বেসের পরে প্রতি কিমি", "After base, per km")}>
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={form.perKmFee}
                  onChange={(e) => setForm((s) => ({ ...s, perKmFee: Number(e.target.value) }))}
                />
              </Field>
            </div>

            {ladder.length > 0 && (
              <div className="mt-3 rounded-md border border-ink-200 bg-ink-50 p-3 text-xs dark:border-ink-300 dark:bg-ink-100">
                <div className="mb-2 font-semibold text-ink-700 dark:text-ink-900">
                  {t("ফি ল্যাডার প্রিভিউ (প্রতি কিমি, �জন ছাড়া)", "Fee ladder preview (per km, no weight)")}
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-5 md:grid-cols-10">
                  {ladder.map((row) => (
                    <div
                      key={row.km}
                      className="flex items-center justify-between rounded border border-ink-200 bg-white px-2 py-1 dark:border-ink-300 dark:bg-ink-50"
                    >
                      <span className="text-ink-500">{row.km}km</span>
                      <span className="font-semibold tabular-nums">�{row.fee}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Section: Weight surcharge */}
          <Section
            title={t("ওজন সারচার্জ", "Weight Surcharge")}
            hint={t(
              "প্রতি কেজিতে +৳। ০ = সারচার্জ নেই। হেভি ওভাররাইড দিয়ে বড় ব্যাগের জন্য ফ্ল্যাট ফি সেট করুন।",
              "Add ৳/kg. 0 = no surcharge. Use heavy override to charge a flat fee past a kg threshold (e.g. 50kg rice bags).",
            )}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label={t("প্রতি কেজি (৳)", "Per-kg (BDT)")} hint={t("০ = অক্ষম", "0 = disabled")}>
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={form.perKgFee}
                  onChange={(e) => setForm((s) => ({ ...s, perKgFee: Number(e.target.value) }))}
                />
              </Field>
              <Field
                label={t("হেভি থ্রেশহোল্ড (কেজি)", "Heavy threshold (kg)")}
                hint={t("ঐচ্ছিক — এর বেশি হলে ফ্ল্যাট ফি", "Optional — above this, flat fee applies")}
              >
                <Input
                  type="number"
                  step="0.5"
                  min={0}
                  value={form.heavyKgThreshold}
                  onChange={(e) => setForm((s) => ({ ...s, heavyKgThreshold: e.target.value }))}
                  placeholder={t("যেমন: ২০", "e.g. 20")}
                />
              </Field>
              <Field
                label={t("হেভি ফি (৳)", "Heavy fee (BDT)")}
                hint={t("থ্রেশহোল্ডের উপরে �্ল্যাট ফি", "Flat fee past threshold")}
              >
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={form.heavyKgFee}
                  onChange={(e) => setForm((s) => ({ ...s, heavyKgFee: e.target.value }))}
                  placeholder={t("যেমন: ৫০", "e.g. 50")}
                />
              </Field>
            </div>
          </Section>

          {/* Section: Free delivery + meta */}
          <Section title={t("ফ্রি ডেলিভারি ও মে�া", "Free Delivery & Meta")}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label={t("ফ্রি �েলিভারি থ্রেশহোল্ড (৳)", "Free above (BDT)")}
                hint={t("এই মূল্যের উপরে হলে ফ্রি", "Orders above this value ship free")}
              >
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={form.freeAbove}
                  onChange={(e) => setForm((s) => ({ ...s, freeAbove: e.target.value }))}
                  placeholder={t("যেমন: ১৫০০", "e.g. 1500")}
                />
              </Field>
              <Field label={t("সর্ট অর্ডার", "Sort order")} hint={t("কম = আগে ম্যাচ হবে", "Lower = matched first")}>
                <Input
                  type="number"
                  step="1"
                  value={form.sortOrder}
                  onChange={(e) => setForm((s) => ({ ...s, sortOrder: Number(e.target.value) }))}
                />
              </Field>
              <Field label={t("সক্রিয়?", "Active?")}>
                <label className="flex h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-ink-300 text-primary-700"
                  />
                  <span className="text-sm">{t("চেকআউটে ব্যবহৃত হবে", "Used at checkout")}</span>
                </label>
              </Field>
            </div>
          </Section>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>
            {t("বাতি�", "Cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !valid}>
            <Save className="h-4 w-4" />
            {save.isPending ? t("সংরক্ষণ...", "Saving...") : t("সংরক্ষণ", "Save")}
          </Button>
        </div>
      </div>

      {/* Read-only map preview modal — opens on "View on map" click.
          Sits on top of the editor so the user can still see fields behind it. */}
      {showMap && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowMap(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-ink-50"
          >
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-ink-900 dark:text-ink-900">
                  <MapIcon className="h-4 w-4" />
                  {form.nameEn || t("(নাম দেওয়া হয়নি)", "(unnamed)")}
                </h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  {Number(form.centerLat).toFixed(6)}, {Number(form.centerLng).toFixed(6)}
                  {" · "}
                  {t("রেডিয়াস", "Radius")} {Number(form.radiusKm) || 0} {t("কিমি", "km")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${form.centerLat}&mlon=${form.centerLng}#map=${previewZoom(Number(form.radiusKm))}/${form.centerLat}/${form.centerLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-ink-300 px-2 text-xs hover:bg-ink-100 dark:border-ink-300 dark:hover:bg-ink-100"
                  title={t("বড় ম্যাপে খুলুন", "Open in full map")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("বড় ম্যাপ", "Open OSM")}
                </a>
                <Button variant="ghost" size="icon" onClick={() => setShowMap(false)} title={t("বন্ধ", "Close")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="relative flex-1">
              <ZonePreviewMap
                center={{ lat: Number(form.centerLat) || 0, lng: Number(form.centerLng) || 0 }}
                radiusKm={Number(form.radiusKm) || 0}
                zoneName={form.nameEn || form.nameBn}
              />
            </div>
            <div className="border-t border-ink-200 bg-ink-50 px-4 py-2 text-[11px] text-ink-500 dark:border-ink-300 dark:bg-ink-100">
              {t(
                "বৃত্ত = এই জোনের সর্বোচ্চ ডেলিভারি এলাকা। ম্যাপ শুধু প্রিভিউ — সরাতে চাইলে Lat/Lng ইনপুট বদলান।",
                "Circle = max delivery area for this zone. Map is preview-only — edit the Lat/Lng inputs to move the pin.",
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: "primary" | "warning" | "danger" | "success" | "info";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100",
    warning: "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
    danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-100",
    success: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-100",
    info: "bg-info-100 text-info-700 dark:bg-info-500/20 dark:text-info-100",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${tones[tone]}`}>{icon}</div>
        <div>
          <div className="text-xs uppercase text-ink-500">{label}</div>
          <div className="text-xl font-bold text-ink-900 dark:text-ink-900">{value}</div>
        </div>
      </CardContent>
    </Card>
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
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-900">{title}</h3>
        {action}
      </div>
      {hint && <p className="mb-2 text-xs text-ink-500">{hint}</p>}
      {children}
    </div>
  );
}
