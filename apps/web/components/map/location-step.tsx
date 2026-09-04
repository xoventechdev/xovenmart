"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Loader2,
  Locate,
  AlertCircle,
  Search,
  CheckCircle2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { useLocationStore } from "@/lib/use-location";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  PIN_ZOOM,
  getCurrentPosition,
  reverseGeocode,
  searchPlaces,
  type DeliveryLocation,
} from "@/lib/location";

// react-leaflet needs window/document at import time — dynamic load it.
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
  ),
});

// Fix Leaflet default marker URLs once.
if (typeof window !== "undefined") {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    iconUrl: "/leaflet/marker-icon.png",
    shadowUrl: "/leaflet/marker-shadow.png",
  });
}

interface ZoneOption {
  id: string;
  nameBn: string;
  nameEn: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

interface Props {
  value: DeliveryLocation | null;
  onChange: (loc: DeliveryLocation | null) => void;
  /** Optional: pre-selected zone id from a parent (e.g. cart-baked choice) */
  initialZoneId?: string;
  /**
   * Compact mode hides the floating coord badge and the village/city
   * summary card so the parent (e.g. AddressFormModal) can show the
   * resolved address exactly once — in its own "Full address" textarea,
   * which is the authoritative single source of truth. The map, zone
   * selector, GPS button, and address search stay.
   */
  compact?: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

/**
 * Single-screen delivery location picker used by checkout.
 *
 * Layout (top → bottom, no tabs):
 *   1. Zone selector pills — pick which delivery zone you live in
 *   2. Map — drop a pin anywhere; if outside the chosen zone, soft warning
 *   3. Address search — typing here auto-drops the pin (and vice-versa)
 *
 * Both the map and the address box share the same `value` so they stay in
 * sync. Picking a zone recenters the map on that zone's center.
 */
export function LocationStep({ value, onChange, initialZoneId, compact }: Props) {
  const { lang } = useTheme();
  const tw = useTwin();
  // When the user picked a saved address (pickedAddressId set), clicking a
  // zone chip should pan the map to the zone center BUT preserve the
  // user's pin lat/lng — otherwise picking a saved Home address would
  // jump the map to the zone's center, losing the actual pin.
  const pickedAddressId = useLocationStore((s) => s.pickedAddressId);
  const { data: zonesData } = useQuery({
    queryKey: ["catalog", "delivery-zones"],
    queryFn: async () => {
      const r = await fetch(`${API}/catalog/delivery-zones`);
      if (!r.ok) return [] as ZoneOption[];
      return (await r.json()) as ZoneOption[];
    },
    staleTime: 60_000,
  });

  const zones: ZoneOption[] = (zonesData ?? []) as any;

  // Currently chosen zone id (local state). Default to first zone.
  const [zoneId, setZoneId] = useState<string | null>(initialZoneId ?? null);
  // Tracks whether the user (or our auto-zone picker) has explicitly
  // chosen a zone — used to avoid clobbering an explicit click with an
  // auto-resolve when the pin moves.
  const userPickedZoneRef = useRef(false);
  useEffect(() => {
    if (zoneId) return;
    if (initialZoneId && zones.some((z) => z.id === initialZoneId)) {
      setZoneId(initialZoneId);
      userPickedZoneRef.current = true;
    } else if (zones.length > 0) {
      setZoneId(zones[0].id);
      userPickedZoneRef.current = true;
    }
  }, [zones, initialZoneId, zoneId]);

  const zone = useMemo(
    () => zones.find((z) => z.id === zoneId) ?? null,
    [zones, zoneId],
  );

  // Auto-resolve the right zone when a pin (saved address or typed pick)
  // arrives — if the pin is inside a known zone, switch to that zone.
  //
  // Without this, the saved-address flow keeps whatever zone was first
  // in the list (often zones[0]), which makes the backend compute
  // distance from the wrong zone's center — the user sees a "wrong"
  // distance like 8.4 km even though their home is right inside Zone B.
  //
  // We only auto-switch when:
  //   - we have a zone to compare against (zones.length > 0)
  //   - we have a pin with finite coords
  //   - the pin is OUTSIDE the currently-selected zone (so the current
  //     zone is wrong, or there's no current zone)
  //   - the user hasn't manually picked a different zone via the chip
  //     in this session. (Once the user clicks a chip, we respect their
  //     choice until they pick a new address.)
  useEffect(() => {
    if (!value || zones.length === 0) return;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    // Find the zone that contains the pin (if any)
    const containingZone = zones.find((z) => {
      const d = haversineKm(lat, lng, z.centerLat, z.centerLng);
      return d <= z.radiusKm;
    });
    if (!containingZone) return;
    if (containingZone.id === zoneId) return;
    // Current zone is either missing or wrong — switch silently to the
    // right one. Don't mark this as a user pick so future moves can
    // still re-resolve if needed.
    setZoneId(containingZone.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng, zones.length]);

  // ---- Map center: prefer the picked pin, else the zone's center ----
  const mapCenter = useMemo<{ lat: number; lng: number }>(() => {
    if (value) {
      const lat = Number(value.lat);
      const lng = Number(value.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    if (zone) return { lat: zone.centerLat, lng: zone.centerLng };
    return DEFAULT_CENTER;
  }, [value?.lat, value?.lng, zone?.centerLat, zone?.centerLng]);

  // ---- Address box state (separate from `value.fullText` so the user
  //      can type freely without us clobbering their input every keystroke) ----
  const [query, setQuery] = useState(value?.fullText ?? "");
  useEffect(() => {
    // If the pin moved from outside (reverse-geocode or GPS), sync the box.
    if (value?.fullText && value.fullText !== query) {
      setQuery(value.fullText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.fullText]);

  // ---- Forward-geocode (typing → suggestions) ----
  const [results, setResults] = useState<DeliveryLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearchError(null);
    const t = setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      setSearching(true);
      try {
        const r = await searchPlaces(q);
        if (myReq !== reqIdRef.current) return;
        setResults(r);
        if (r.length === 0)
          setSearchError(
            tw(
              "কোনো ঠিকানা পাওয়া যায়নি — আরো বিস্তারিত লিখুন",
              "No addresses found — please be more specific",
            ),
          );
      } catch {
        if (myReq === reqIdRef.current)
          setSearchError(tw("অনুসন্ধান ব্যর্থ হয়েছে", "Search failed"));
      } finally {
        if (myReq === reqIdRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // ---- Reverse-geocode (pin move → fill text) is handled by LocationPicker;
  //      here we just receive the value via props and propagate ----

  // ---- Detect "outside chosen zone" to show a soft warning ----
  const distanceFromZoneCenterKm = useMemo(() => {
    if (!zone || !value) return null;
    return haversineKm(zone.centerLat, zone.centerLng, value.lat, value.lng);
  }, [zone, value]);

  const isOutsideZone =
    !!zone && !!value && (distanceFromZoneCenterKm ?? 0) > zone.radiusKm;

  // ---- "Use my location" button ----
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const useGps = async () => {
    setGpsError(null);
    setGpsBusy(true);
    try {
      const pos = await getCurrentPosition();
      const loc = await reverseGeocode(pos.lat, pos.lng);
      onChange(
        loc ?? {
          lat: pos.lat,
          lng: pos.lng,
          fullText: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
          line1: "",
          area: "",
          city: "",
          source: "gps",
        },
      );
    } catch (e: any) {
      setGpsError(
        e?.message ?? tw("লোকেশন পাওয়া যায়নি", "Could not get your location"),
      );
    } finally {
      setGpsBusy(false);
    }
  };

  const handlePickCandidate = (loc: DeliveryLocation) => {
    onChange({ ...loc, source: "typed" });
    setResults([]);
    // query box is auto-synced via the value.fullText effect above
  };

  // ---- Reverse-geocode on pin drop ----
  // The pin moves instantly (Leaflet owns its position via `pinPos`), but
  // we still need Nominatim's village / union / district to populate
  // `DeliveryLocation.area` and `.city` so the form can derive the
  // backend `area` field. Reuse the search-debounce pattern: a token
  // guard (`reqIdRef`) discards stale responses if the user drags the
  // pin several times in quick succession, so the final pin's village
  // name is what surfaces (no flicker).
  const [pinGeoBusy, setPinGeoBusy] = useState(false);

  async function reverseAndEmit(lat: number, lng: number) {
    const myReq = ++reqIdRef.current;
    // Emit the user's click coords synchronously so the Leaflet marker
    // visibly jumps to the exact spot — BEFORE we await Nominatim. This
    // means the marker's visual position is always anchored to the user's
    // click; the async geocode only enriches the address text fields.
    onChange({
      lat,
      lng,
      fullText: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      line1: "",
      area: "",
      city: "",
      source: "map",
    });
    setPinGeoBusy(true);
    try {
      const loc = await reverseGeocode(lat, lng);
      if (myReq !== reqIdRef.current) return;
      // Keep the marker at the user's clicked coordinates — Nominatim
      // may snap to the nearest road/feature and we don't want the pin
      // to teleport mid-flow. Only update the address text fields.
      if (loc) {
        onChange({
          ...loc,
          lat,
          lng,
          source: "map",
        });
      }
    } finally {
      if (myReq === reqIdRef.current) setPinGeoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ───────── 1. Zone selector ───────── */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700 dark:text-ink-200">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {tw("আপনার ডেলিভারি জোন নির্বাচন করুন", "Select your delivery zone")}
        </div>
        {zones.length === 0 ? (
          <div className="h-9 animate-pulse rounded-md bg-ink-100 dark:bg-ink-800" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => {
              const selected = z.id === zoneId;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    setZoneId(z.id);
                    userPickedZoneRef.current = true;
                    // When the user has a saved address picked, the zone
                    // chip is "snap map only" — pan the map to the zone
                    // center but KEEP the saved pin lat/lng. Otherwise,
                    // rewrite the location to the zone center (legacy
                    // behaviour for fresh checkouts / map-only mode).
                    if (pickedAddressId && value) {
                      // Keep value untouched — ZoneMarker will pan the
                      // map via its lastZoneRef effect.
                      return;
                    }
                    onChange({
                      lat: z.centerLat,
                      lng: z.centerLng,
                      fullText: z.nameEn,
                      line1: "",
                      area: z.nameEn,
                      city: z.nameEn,
                      source: "map",
                    });
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? "border-primary bg-primary text-white shadow-sm"
                      : "border-ink-200 bg-white text-ink-700 hover:border-primary-300 hover:bg-primary-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
                  }`}
                >
                  {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {z.nameBn}
                  <span className={`text-[10px] ${selected ? "text-white/80" : "text-ink-400"}`}>
                    ({z.radiusKm} km)
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ───────── 2. Map (always visible) ───────── */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700 dark:text-ink-200">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {tw("ম্যাপে আপনার লোকেশন চিহ্নিত করুন", "Mark your location on the map")}
        </div>
        <div className="relative overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
          <div className="h-64">
            {zone ? (
              <MapContainer
                key={zone.id}
                center={[mapCenter.lat, mapCenter.lng]}
                // Tight zoom on the pin when we have one (saved address
                // loaded, GPS resolved, etc.), wider zone-level zoom
                // otherwise. React-leaflet only respects `zoom` on
                // mount — for value-driven recentering we rely on the
                // useEffect inside <ZoneMarker /> below.
                zoom={value ? PIN_ZOOM : DEFAULT_ZOOM}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  maxZoom={19}
                />
                {/* Zone coverage circle */}
                <Circle
                  center={[zone.centerLat, zone.centerLng]}
                  radius={Math.max(100, zone.radiusKm * 1000)}
                  pathOptions={{
                    color: "#2563eb",
                    weight: 2,
                    opacity: 0.7,
                    fillColor: "#3b82f6",
                    fillOpacity: 0.08,
                  }}
                />
                <ZoneMarker
                  center={mapCenter}
                  zone={zone}
                  value={value}
                  onChange={(v) => reverseAndEmit(v.lat, v.lng)}
                />
              </MapContainer>
            ) : (
              <LeafletMap
                value={mapCenter}
                onChange={(v) => reverseAndEmit(v.lat, v.lng)}
              />
            )}
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={useGps}
            disabled={gpsBusy}
            className="absolute right-2 top-2 z-[400] gap-1.5 shadow-md"
          >
            {gpsBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Locate className="h-3.5 w-3.5" />
            )}
            {tw("আমার লোকেশন", "My location")}
          </Button>

          {value && !compact && (
            <div className="pointer-events-none absolute left-2 top-2 z-[400] rounded-full bg-white/90 px-2 py-1 text-[10px] font-mono text-ink-700 shadow">
              {Number(value.lat).toFixed(4)}, {Number(value.lng).toFixed(4)}
            </div>
          )}
        </div>

        {gpsError && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-danger-50 px-2.5 py-1.5 text-xs text-danger-700 dark:bg-danger-500/20">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{gpsError}</span>
          </div>
        )}

        {isOutsideZone && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {lang === "en" ? (
                <>
                  The pin is outside the <strong>{zone?.nameEn ?? zone?.nameBn}</strong> zone
                  ({distanceFromZoneCenterKm?.toFixed(1)} km, max {zone?.radiusKm} km).
                  Delivery fee may increase or delivery may not be available in this area.
                </>
              ) : (
                <>
                  পিনটি <strong>{zone?.nameBn}</strong> জোনের বাইরে ({distanceFromZoneCenterKm?.toFixed(1)} km, সর্বোচ্চ {zone?.radiusKm} km)।
                  ডেলিভারি ফি বাড়তে পারে অথবা এই এলাকায় ডেলিভারি সম্ভব নাও হতে পারে।
                </>
              )}
            </span>
          </div>
        )}

        {/* Auto-detected address card — surfaces the village / union /
            district returned by Nominatim the moment the user drops a
            pin, so they see "ঘটালিয়াপাড়া, চৌদ্দগ্রাম পৌরসভা" without
            typing. While the reverse-geocode is in flight we show a
            spinner instead of stale or empty fields.

            Hidden in `compact` mode (e.g. AddressFormModal) because the
            parent already shows the resolved address in its "Full
            address" textarea — surfacing the same info twice clutters
            the modal and confuses users about which field is canonical. */}
        {value && !compact && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50/50 px-3 py-2 dark:border-primary-700 dark:bg-primary-900/15">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              {pinGeoBusy ? (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-600 dark:text-ink-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {tw("লোকেশন শনাক্ত হচ্ছে...", "Detecting location...")}
                </div>
              ) : (
                (() => {
                  // Pick the most specific label Nominatim returned —
                  // street first (line1), then village (area), then the
                  // municipality/city. Empty-string fall-through means we
                  // mark this pin as unmapped rather than showing a
                  // confusing "(unnamed area)".
                  const title =
                    value.line1?.trim() ||
                    value.area?.trim() ||
                    value.city?.trim() ||
                    "";
                  const subtitle =
                    // Show whichever of the admin fields we DIDN'T already
                    // use as title, so the card always reads as a layered
                    // hierarchy rather than duplicating the title.
                    value.area?.trim() &&
                      value.area !== title
                      ? `${value.area}${value.city ? `, ${value.city}` : ""}`
                      : value.city?.trim() && value.city !== title
                      ? value.city
                      : "";
                  return (
                    <>
                      <div className="flex items-center gap-1.5">
                        {title ? (
                          <span className="truncate font-black text-ink-900 dark:text-ink-50 text-[12px] sm:text-[13px]">
                            {title}
                          </span>
                        ) : (
                          <span className="truncate text-[11px] italic text-ink-500 dark:text-ink-300">
                            {tw(
                              "এই পিনের জন্য ম্যাপের নাম পাওয়া যায়নি — ঠিকানা লিখে দিন",
                              "No map name for this pin — please type the address",
                            )}
                          </span>
                        )}
                        {zone &&
                          distanceFromZoneCenterKm != null &&
                          (title || subtitle) && (
                            <span className="shrink-0 rounded-md bg-primary-100 px-1.5 py-0.5 text-[10px] font-black text-primary dark:bg-primary-500/20 dark:text-primary-100">
                              📍 {distanceFromZoneCenterKm.toFixed(1)}{" "}
                              {tw("কিমি", "km")}
                            </span>
                          )}
                      </div>
                      {subtitle && (
                        <p className="mt-0.5 truncate text-[11px] text-ink-600 dark:text-ink-200">
                          {subtitle}
                        </p>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {value && !compact && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Badge variant="muted" className="mr-1 text-[10px]">
              {value.source === "gps"
                ? "GPS"
                : value.source === "typed"
                ? tw("টাইপ করা", "Typed")
                : tw("ম্যাপ পিন", "Map pin")}
            </Badge>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-1 underline hover:text-ink-900 dark:hover:text-ink-50"
            >
              {tw("মুছে ফেলুন", "Clear")}
            </button>
          </div>
        )}
      </div>

      {/* ───────── 3. Address text box (always visible) ───────── */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-700 dark:text-ink-200">
          <Search className="h-3.5 w-3.5 text-primary" />
          {tw("এবং ঠিকানা লিখে খুঁজুন", "and search by typing an address")}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tw(
              "যেমন: মুডাফরগঞ্জ বাজার, লাকসাম সদর...",
              "e.g. Mudafarganj Bazar, Laksam Sadar...",
            )}
            className="pl-9 pr-9"
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {!searching && query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-ink-100 dark:hover:bg-ink-800"
              title={tw("মুছুন", "Clear")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {searchError && (
          <p className="mt-1 text-xs text-muted-foreground">{searchError}</p>
        )}

        {results.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handlePickCandidate(r)}
                  className="group flex w-full items-start gap-2 rounded-md border border-ink-200 bg-white p-2.5 text-left hover:border-primary-300 hover:bg-primary-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-primary-900/30"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900 dark:text-ink-50">
                      {r.fullText.split(",").slice(0, 2).join(",") || r.fullText}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.fullText}
                    </span>
                  </span>
                  <span className="text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100">
                    {tw("নির্বাচন →", "Select →")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Inner component that lives inside MapContainer so we can use the `useMap`
 * hook. Draws the marker (draggable) and recenters the map when the pin
 * changes externally (e.g. user picked a different zone).
 */
function ZoneMarker({
  center,
  zone,
  value,
  onChange,
}: {
  center: { lat: number; lng: number };
  zone: ZoneOption;
  value: DeliveryLocation | null;
  onChange: (v: { lat: number; lng: number }) => void;
}) {
  const map = useMap();
  const lastZoneRef = useRef<string>("");
  // Track the last "saved pin" we recentered on so we don't fight with
  // the user's click-drag → the useMapEvents click handler already
  // pans via setView(animate) for clicks, so we only recenter when the
  // pin coordinates change from a *non-click* source (saved address
  // loaded, reverse-geocode resolved, GPS fix).
  const lastPinKeyRef = useRef<string>("");
  // Flag so the next click from user pan/drag doesn't drop a pin mid-gesture.
  const dragGuardRef = useRef<{ x: number; y: number } | null>(null);

  // Recenter the map when the user picks a different zone.
  useEffect(() => {
    const key = zone.id;
    if (key === lastZoneRef.current) return;
    lastZoneRef.current = key;
    map.setView([zone.centerLat, zone.centerLng], DEFAULT_ZOOM, { animate: true });
  }, [zone.id, zone.centerLat, zone.centerLng, map]);

  // Recenter on the pin whenever `value` updates from a non-click
  // source. We key on rounded lat/lng (4 decimals ≈ 11m) so a fresh
  // reverse-geocode at the same spot doesn't re-trigger, and so a
  // pin drag/click (which already pans the map) doesn't fight with us.
  useEffect(() => {
    if (!value) return;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (key === lastPinKeyRef.current) return;
    lastPinKeyRef.current = key;
    map.setView([lat, lng], PIN_ZOOM, { animate: true });
  }, [value?.lat, value?.lng, map]);

  // Click anywhere on the map (desktop + mobile tap) → drop a pin there.
  // We track the mousedown position so dragging the map to pan doesn't
  // accidentally fire a pin-move on mouseup.
  useMapEvents({
    mousedown: (e) => {
      dragGuardRef.current = {
        x: (e.originalEvent as MouseEvent).clientX,
        y: (e.originalEvent as MouseEvent).clientY,
      };
    },
    click: (e) => {
      // Only treat as a "tap" if the cursor didn't move much between
      // mousedown and click (i.e. not a pan).
      const start = dragGuardRef.current;
      dragGuardRef.current = null;
      if (start) {
        const oe = e.originalEvent as MouseEvent;
        const dx = oe.clientX - start.x;
        const dy = oe.clientY - start.y;
        if (Math.hypot(dx, dy) > 6) return; // user was panning, ignore
      }
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  const pinPos: [number, number] = value
    ? [Number(value.lat) || center.lat, Number(value.lng) || center.lng]
    : [center.lat, center.lng];

  return (
    <Marker
      position={pinPos}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const m = e.target as L.Marker;
          const ll = m.getLatLng();
          onChange({ lat: ll.lat, lng: ll.lng });
        },
      }}
    />
  );
}

/**
 * Great-circle distance between two lat/lng points in km.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
