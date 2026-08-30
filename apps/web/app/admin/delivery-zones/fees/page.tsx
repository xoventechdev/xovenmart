"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  ArrowLeft,
  DollarSign,
  Truck,
  Plus,
  Info,
  Wallet,
  ChevronRight,
  Weight,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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
}

/**
 * Build a distance-vs-fee ladder for a zone.
 * Returns one entry per km from 1 up to the zone's max radius.
 */
function buildLadder(z: DeliveryZone): { km: number; fee: number }[] {
  const rows: { km: number; fee: number }[] = [];
  const max = Math.min(Number(z.radiusKm) || 0, 12);
  for (let km = 1; km <= Math.max(1, Math.floor(max)); km++) {
    const extra = Math.max(0, Math.ceil(km - Number(z.baseKm)));
    const fee = Math.round(Number(z.baseFee) + extra * Number(z.perKmFee));
    rows.push({ km, fee });
  }
  return rows;
}

/**
 * Sample a few weights so admin can see how the per-kg / heavy-override
 * rows stack on top of the distance fee.
 */
const WEIGHT_SAMPLES = [1, 5, 10, 20, 50];

export default function DeliveryFeesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [search, setSearch] = useState("");

  const { data: zones, isLoading } = useQuery({
    queryKey: ["admin", "delivery-zones"],
    queryFn: () => api.get("/admin/delivery-zones"),
  });

  const list: DeliveryZone[] = (zones ?? []) as any;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((z) => {
      if (!q) return true;
      return z.nameBn.toLowerCase().includes(q) || z.nameEn.toLowerCase().includes(q);
    });
  }, [list, search]);

  const stats = useMemo(() => {
    const active = list.filter((z) => z.isActive);
    const minBase = active.length ? Math.min(...active.map((z) => z.baseFee)) : 0;
    const maxPerKm = active.length ? Math.max(...active.map((z) => z.perKmFee)) : 0;
    const heavyZones = active.filter((z) => z.heavyKgThreshold != null).length;
    const freeZones = active.filter((z) => z.freeAbove != null).length;
    return { activeCount: active.length, minBase, maxPerKm, heavyZones, freeZones };
  }, [list]);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/admin/delivery-zones"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> {t("জোন তালিকায়", "Back to zones")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-900">
          {t("ফি স্ট্রাকচার ও ল্যাডার", "Fee Structure & Ladder")}
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {t(
            "প্রতিটি জোনের দূরত্ব-ভিত্তিক ফি, ওজন সারচার্জ এবং হেভি ওভাররাইড পর্যালোচনা করুন",
            "Review the distance-based fee, weight surcharge, and heavy override for each zone",
          )}
        </p>
      </div>

      {/* How fees work */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-info-700" /> {t("কীভাবে কাজ করে", "How it works")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-700 dark:text-ink-900">
          <p>
            <b>{t("দূরত্ব:", "Distance:")}</b>{" "}
            {t(
              "বেস ফি প্রথম N কিমি কভার করে। এর পরে প্রতি কিমিতে +perKmFee যোগ হয় (ceil)।",
              "Base fee covers the first N km. Beyond that, +perKmFee per km (ceiling).",
            )}
          </p>
          <p>
            <b>{t("ওজন:", "Weight:")}</b>{" "}
            {t(
              "কার্টের মোট ওজন (কেজি) × perKgFee যোগ হয়। heavyKgThreshold সেট থাকলে এবং ওজন > threshold হলে perKgFee বাদ দিয়ে flat heavyKgFee নেওয়া হয়।",
              "Cart weight (kg) × perKgFee. If heavyKgThreshold is set and weight > threshold, perKgFee is replaced with the flat heavyKgFee.",
            )}
          </p>
          <p>
            <b>{t("ফ্রি:", "Free:")}</b>{" "}
            {t(
              "সাবটোটাল freeAbove-এর চেয়ে বেশি বা সমান হলে (distance+weight) ফি শূন্য।",
              "If subtotal ≥ freeAbove, the (distance+weight) fee is zeroed.",
            )}
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<MapPin className="h-5 w-5" />} tone="primary" label={t("সক্রিয় জোন", "Active Zones")} value={stats.activeCount} />
        <StatCard icon={<DollarSign className="h-5 w-5" />} tone="warning" label={t("সর্বনিম্ন বেস", "Min Base Fee")} value={`৳${stats.minBase}`} />
        <StatCard icon={<Truck className="h-5 w-5" />} tone="success" label={t("সর্বোচ্চ প্রতি কিমি", "Max Per-km")} value={`৳${stats.maxPerKm}/km`} />
        <StatCard icon={<Weight className="h-5 w-5" />} tone="info" label={t("হেভি ওভাররাইড জোন", "Heavy Override Zones")} value={stats.heavyZones} />
      </div>

      <Card>
        <CardContent className="p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("জোনের নাম দিয়ে খুঁজুন...", "Search by zone name...")}
            className="w-full max-w-xs rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-500">
            {t("কোন জোন নেই", "No zones")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((z) => (
            <ZoneFeeCard key={z.id} zone={z} t={t} lang={lang} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> {t("যোগ করুন", "Need more zones?")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/admin/delivery-zones">
            <Button>
              <Plus className="h-4 w-4" /> {t("নতুন জোন যোগ করুন", "Add New Zone")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ZoneFeeCard({
  zone,
  t,
  lang,
}: {
  zone: DeliveryZone;
  t: (bn: string, en: string) => string;
  lang: "bn" | "en";
}) {
  const name = lang === "bn" ? zone.nameBn : zone.nameEn;
  const ladder = useMemo(() => buildLadder(zone), [zone]);

  const maxLadderFee = ladder.reduce((m, r) => Math.max(m, r.fee), 0);

  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md",
        !zone.isActive && "opacity-60",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">{name}</CardTitle>
          <p className="mt-1 font-mono text-[11px] text-ink-500">
            {zone.centerLat.toFixed(4)}, {zone.centerLng.toFixed(4)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {zone.isActive ? (
            <Badge variant="success">{t("সক্রিয়", "Active")}</Badge>
          ) : (
            <Badge variant="muted">{t("নিষ্ক্রিয়", "Inactive")}</Badge>
          )}
          <Badge variant="outline">#{zone.sortOrder}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rule summary */}
        <div className="grid gap-2 sm:grid-cols-4">
          <Rule label={t("বেস", "Base")} value={`৳${zone.baseFee} / ${zone.baseKm}km`} />
          <Rule label={t("প্রতি কিমি", "Per km")} value={`৳${zone.perKmFee}`} />
          <Rule label={t("প্রতি কেজি", "Per kg")} value={zone.perKgFee > 0 ? `৳${zone.perKgFee}` : "—"} />
          <Rule
            label={t("হেভি", "Heavy")}
            value={
              zone.heavyKgThreshold != null && zone.heavyKgFee != null
                ? `>${zone.heavyKgThreshold}kg → ৳${zone.heavyKgFee}`
                : "—"
            }
          />
          <Rule
            label={t("ম্যাক্স", "Max")}
            value={`${zone.radiusKm} ${t("কিমি", "km")}`}
          />
          <Rule
            label={t("ফ্রি", "Free")}
            value={zone.freeAbove != null ? `≥ ৳${zone.freeAbove}` : "—"}
          />
        </div>

        {/* Distance ladder */}
        {ladder.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-700 dark:text-ink-900">
              <Layers className="h-3.5 w-3.5" />
              {t("দূরত্ব ল্যাডার (শুধু দূরত্ব, ওজন ছাড়া)", "Distance ladder (distance only, no weight)")}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12">
              {ladder.map((row) => {
                const pct = maxLadderFee > 0 ? Math.round((row.fee / maxLadderFee) * 100) : 0;
                return (
                  <div
                    key={row.km}
                    className="relative overflow-hidden rounded-md border border-ink-200 bg-white px-2 py-2 text-xs dark:border-ink-300 dark:bg-ink-50"
                    title={`${row.km}km → ৳${row.fee}`}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-primary-100 dark:bg-primary-800/40"
                      style={{ width: `${Math.max(8, pct)}%` }}
                    />
                    <div className="relative flex items-center justify-between">
                      <span className="font-medium text-ink-700 dark:text-ink-900">{row.km}km</span>
                      <span className="font-bold tabular-nums text-primary-700 dark:text-primary-300">
                        ৳{row.fee}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Weight surcharge sample table */}
        {(zone.perKgFee > 0 || zone.heavyKgThreshold != null) && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-700 dark:text-ink-900">
              <Weight className="h-3.5 w-3.5" />
              {t("ওজনের প্রভাব (১ কিমি বেস ফি + ওজন)", "Weight impact (1 km base fee + weight)")}
            </div>
            <div className="overflow-x-auto rounded-md border border-ink-200 dark:border-ink-300">
              <table className="w-full text-xs">
                <thead className="bg-ink-50 dark:bg-ink-100">
                  <tr>
                    <th className="px-2 py-1.5 text-left">{t("ওজন", "Weight")}</th>
                    {WEIGHT_SAMPLES.map((w) => (
                      <th key={w} className="px-2 py-1.5 text-right tabular-nums">
                        {w}kg
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-1.5 text-ink-500">{t("মোট ফি", "Total fee")}</td>
                    {WEIGHT_SAMPLES.map((w) => {
                      let wFee = w * zone.perKgFee;
                      if (
                        zone.heavyKgThreshold != null &&
                        zone.heavyKgFee != null &&
                        w > zone.heavyKgThreshold
                      ) {
                        wFee = zone.heavyKgFee;
                      }
                      const total = zone.baseFee + wFee;
                      const heavy =
                        zone.heavyKgThreshold != null && w > zone.heavyKgThreshold;
                      return (
                        <td
                          key={w}
                          className={cn(
                            "px-2 py-1.5 text-right tabular-nums font-semibold",
                            heavy && "text-warning-700 dark:text-warning-300",
                          )}
                          title={heavy ? t("হেভি ওভাররাইড প্রযোজ্য", "Heavy override applies") : undefined}
                        >
                          ৳{total}
                          {heavy && <span className="ml-1 text-[10px]">⚡</span>}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Link
          href="/admin/delivery-zones"
          className="inline-flex items-center gap-1 text-xs text-primary-700 hover:underline"
        >
          {t("জোন সম্পাদনা করুন", "Edit zone")} <ChevronRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function Rule({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ink-200 bg-ink-50 px-2 py-1.5 dark:border-ink-300 dark:bg-ink-100">
      <div className="text-[10px] uppercase text-ink-500">{label}</div>
      <div className="text-sm font-semibold text-ink-900 dark:text-ink-900">{value}</div>
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
