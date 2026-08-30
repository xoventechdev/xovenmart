"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Loader2, Locate, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  getCurrentPosition,
  reverseGeocode,
  type DeliveryLocation,
} from "@/lib/location";

// react-leaflet relies on browser-only APIs (window, document), so we
// dynamic-import the actual map with ssr:false. This file wraps that in a
// friendly loading/error UI shell.
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
  ),
});

interface Props {
  value: { lat: number; lng: number } | null;
  onPick: (loc: DeliveryLocation) => void;
  /** Show the "📍 আমার লোকেশন" floating button (default true) */
  showGpsButton?: boolean;
  /** Fixed height (default h-72) */
  heightClass?: string;
  /** Read-only mode (no drag) */
  readOnly?: boolean;
}

export function LocationPicker({
  value,
  onPick,
  showGpsButton = true,
  heightClass = "h-72",
  readOnly = false,
}: Props) {
  const center = useMemo(
    () => value ?? DEFAULT_CENTER,
    [value?.lat, value?.lng, value],
  );
  const lastReverseKeyRef = useRef<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reverse-geocode when the pin moves. Debounced 400ms to avoid hammering
  // Nominatim while the user drags.
  useEffect(() => {
    if (!value) return;
    const key = `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
    if (key === lastReverseKeyRef.current) return;
    lastReverseKeyRef.current = key;

    const t = setTimeout(async () => {
      const loc = await reverseGeocode(value.lat, value.lng);
      if (loc) onPick(loc);
    }, 400);
    return () => clearTimeout(t);
  }, [value?.lat, value?.lng]);

  const useGps = async () => {
    setError(null);
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      const loc = await reverseGeocode(pos.lat, pos.lng);
      if (loc) {
        onPick(loc);
      } else {
        // Even if reverse-geocode fails, drop the pin
        onPick({
          lat: pos.lat,
          lng: pos.lng,
          fullText: `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`,
          line1: "",
          area: "",
          city: "",
          source: "gps",
        });
      }
    } catch (e: any) {
      setError(e?.message ?? "লোকেশন পাওয়া যায়নি");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={`relative overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700 ${heightClass}`}
      >
        <LeafletMap
          value={center}
          onChange={(v) => {
            if (readOnly) return;
            // Optimistic update — reverse-geocode fills the address async
            onPick({
              lat: v.lat,
              lng: v.lng,
              fullText: `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`,
              line1: "",
              area: "",
              city: "",
              source: "map",
            });
          }}
          readOnly={readOnly}
        />

        {showGpsButton && !readOnly && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={useGps}
            disabled={busy}
            className="absolute right-2 top-2 z-[400] gap-1.5 shadow-md"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Locate className="h-3.5 w-3.5" />
            )}
            আমার লোকেশন
          </Button>
        )}

        {value && (
          <div className="pointer-events-none absolute left-2 top-2 z-[400] rounded-full bg-white/90 px-2 py-1 text-[10px] font-mono text-ink-700 shadow">
            {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-1.5 rounded-md bg-danger-50 px-2.5 py-1.5 text-xs text-danger-700 dark:bg-danger-500/20">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!readOnly && !value && (
        <p className="text-xs text-muted-foreground">
          <MapPin className="mr-1 inline h-3 w-3" />
          পিন টেনে আপনার ডেলিভারি লোকেশনে সেট করুন
        </p>
      )}
    </div>
  );
}