"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Crosshair, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { DEFAULT_CENTER } from "@/lib/location";
import type { AddressType } from "@/lib/addresses";

// Lazy-load the underlying LeafletMap so the heavy leaflet bundle only
// ships when the form is actually rendered (e.g. inside a popup).
const LeafletMap = dynamic(
  () => import("@/components/map/leaflet-map").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-lg bg-ink-100 dark:bg-ink-200" />
    ),
  },
);

const SLOT_LABELS: Record<AddressType, { bn: string; en: string }> = {
  HOME: { bn: "বাড়ি", en: "Home" },
  OFFICE: { bn: "অফিস", en: "Office" },
  OTHER: { bn: "অন্যান্য", en: "Other" },
};

export interface AddressCaptureValue {
  fullText: string;
  lat: number | null;
  lng: number | null;
  /** Slot (only set when `showLabelType` is true AND the user has
   *  interacted with the slot chips). Always present in the callback. */
  type: AddressType;
  /** Label (only set when `showLabelType` is true AND the user has typed
   *  in the label input). Empty string when blank. */
  label: string;
}

export interface AddressCaptureProps {
  /** Controlled value. When `onChange` is also passed the component
   *  mirrors internal state up to the parent on every keystroke / pin
   *  drop. If neither is passed the component runs fully uncontrolled.
   *  `type` + `label` are always included so callers can render the
   *  current slot selection without owning their own chip UI. */
  value?: AddressCaptureValue;
  onChange?: (v: AddressCaptureValue) => void;

  /** Show the free-text label input + slot chips (Home / Office / Other).
   *  Defaults to false (used by guest checkout + "use a different address"
   *  popups where we don't necessarily save). The /account/addresses page
   *  passes true so the user can name the slot. */
  showLabelType?: boolean;

  /** Show the "Save this address" checkbox. Hidden when this prop is false.
   *  Defaults to false. Logged-in "use a different address" passes true so
   *  the user can opt-in to saving the one-off address. */
  showSaveToggle?: boolean;

  /** Show the "Use current location" button (browser geolocation).
   *  Defaults to true — almost every surface wants it. */
  showGpsButton?: boolean;

  /** Default values — used in EDIT mode (open the popup on an existing
   *  address and prefill from the row). */
  defaultFullText?: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
  defaultType?: AddressType;
  defaultLabel?: string;

  /** Subtotal for the live delivery-fee quote. When undefined, the readout
   *  is suppressed (e.g. /account/addresses has no cart to quote against). */
  cartSubtotal?: number;

  /** Number of items + per-item weight in grams — used by the delivery-fee
   *  endpoint to compute the weight-based fee. Optional. */
  cartItems?: Array<{ qty: number; weightGrams?: number }>;

  /** Called once the user submits the form (textarea + pin both valid).
   *  Receives the AddressCaptureValue + the optional save metadata. */
  onSubmit?: (payload: {
    fullText: string;
    lat: number;
    lng: number;
    save: boolean;
    type: AddressType;
    label: string | null;
  }) => void;

  /** Optional render-prop slot for an external submit button. The default
   *  submit button is hidden when this is provided. */
  renderSubmit?: (state: {
    canSubmit: boolean;
    submitting: boolean;
    submit: () => void;
  }) => React.ReactNode;

  /** Hide the inner submit button row entirely (caller provides its own). */
  hideSubmitButton?: boolean;
}

/**
 * Single source of truth for "the user provides an address".
 *
 * The contract from the user's spec:
 *   1. Free-text "Full address" — mandatory, 5–500 chars.
 *   2. Map pin — mandatory for saved addresses (delivery fee + zone depend
 *      on the lat/lng).
 *
 * Everything else (zone, fee, area, landmark, line1, city, postcode) is
 * derived server-side or never asked. This component intentionally does
 * NOT expose any of those fields to the user.
 *
 * Bilingual (bn ⇄ en) labels via `useTwin()`.
 *
 * Consumers (4):
 *   - /account/addresses → add/edit (showLabelType=true, showSaveToggle=false)
 *   - Checkout saved-address step → "use a different address" popup
 *     (showLabelType=false, showSaveToggle=true)
 *   - Checkout saved-address step → first-save pop (showLabelType=true,
 *     showSaveToggle=false because the "save" is implicit)
 *   - Checkout guest branch → inline (showLabelType=false, showSaveToggle=false)
 */
export function AddressCapture({
  value,
  onChange,
  showLabelType = false,
  showSaveToggle = false,
  showGpsButton = true,
  defaultFullText = "",
  defaultLat = null,
  defaultLng = null,
  defaultType = "HOME",
  defaultLabel = "",
  cartSubtotal,
  cartItems,
  onSubmit,
  renderSubmit,
  hideSubmitButton = false,
}: AddressCaptureProps) {
  const { lang } = useTheme();
  const tw = useTwin();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  // Local state — initialised once from defaults so re-renders with
  // identical defaults don't reset a user-typed textarea.
  const [fullText, setFullText] = useState(defaultFullText);
  const [lat, setLat] = useState<number | null>(defaultLat);
  const [lng, setLng] = useState<number | null>(defaultLng);
  const [save, setSave] = useState(false);
  const [type, setType] = useState<AddressType>(defaultType);
  const [label, setLabel] = useState(defaultLabel);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Mirror state up to parent if controlled.
  // Skip the very first render so we don't fire onChange with the
  // defaults (which would clobber the parent's intended initial state).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!onChange) return;
    onChange({ fullText, lat, lng, type, label });
  }, [fullText, lat, lng, type, label, onChange]);

  // ── Live delivery fee + zone readout (debounced 400ms after last move) ──
  const [debouncedLat, setDebouncedLat] = useState<number | null>(lat);
  const [debouncedLng, setDebouncedLng] = useState<number | null>(lng);
  useEffect(() => {
    if (lat == null || lng == null) {
      setDebouncedLat(null);
      setDebouncedLng(null);
      return;
    }
    const id = setTimeout(() => {
      setDebouncedLat(lat);
      setDebouncedLng(lng);
    }, 400);
    return () => clearTimeout(id);
  }, [lat, lng]);

  type FeeResp = {
    zoneId?: string;
    deliveryFee?: number;
    outsideAllZones?: boolean;
  };

  const feeQuery = useQuery<FeeResp | null>({
    queryKey: [
      "delivery-fee",
      debouncedLat,
      debouncedLng,
      cartSubtotal ?? 0,
      cartItems?.length ?? 0,
    ],
    queryFn: async () => {
      if (debouncedLat == null || debouncedLng == null) return null;
      const base = (
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      ).replace(/\/api\/v\d+\/?$/, "");
      const params = new URLSearchParams({
        lat: String(debouncedLat),
        lng: String(debouncedLng),
        subtotal: String(cartSubtotal ?? 0),
      });
      if (cartItems && cartItems.length > 0) {
        params.set(
          "items",
          JSON.stringify(
            cartItems.map((i) => ({
              qty: i.qty,
              weightGrams:
                i.weightGrams && i.weightGrams > 0 ? i.weightGrams : undefined,
            })),
          ),
        );
      }
      const res = await fetch(`${base}/api/v1/catalog/delivery-fee?${params}`);
      if (!res.ok) return null;
      return (await res.json()) as FeeResp;
    },
    enabled:
      debouncedLat != null &&
      debouncedLng != null &&
      typeof cartSubtotal === "number",
    staleTime: 30_000,
  });

  // ── GPS handler ────────────────────────────────────────────────
  function handleGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error(
        t("ব্রাউজার লোকেশন সমর্থন করে না", "Geolocation is not supported"),
      );
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsBusy(false);
        // Per locked decision: do NOT auto-fill the textarea. The pin
        // moves; the user types their address manually.
      },
      (err) => {
        setGpsBusy(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? t("লোকেশন অনুমতি প্রত্যাখ্যাত", "Location permission denied")
            : t("লোকেশন পাওয়া যায়নি", "Couldn't get your location");
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  // ── Textarea handler ──────────────────────────────────────────
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = e.target.value;
    if (raw.length > 500) {
      // Hard-gate: truncate to 500 and toast.
      setFullText(raw.slice(0, 500));
      toast.error(
        t("সর্বোচ্চ ৫০০ অক্ষর", "Maximum 500 characters"),
      );
      return;
    }
    setFullText(raw);
  }

  // ── Submit ────────────────────────────────────────────────────
  const trimmed = fullText.trim();
  const hasPin = lat != null && lng != null;
  const valid = trimmed.length >= 5 && hasPin;

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid || submitting || !onSubmit) return;
    setSubmitting(true);
    try {
      onSubmit({
        fullText: trimmed,
        lat: lat as number,
        lng: lng as number,
        save,
        type,
        label: label.trim() || null,
      });
    } finally {
      // Caller closes the modal / navigates away. Reset guard so a
      // second invocation (in case the caller reuses us) works.
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* ── Label + slot selector (optional) ───────────────────── */}
      {showLabelType && (
        <>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
              {t("স্লট", "Slot")}
            </label>
            <div className="flex flex-wrap gap-2">
              {(["HOME", "OFFICE", "OTHER"] as AddressType[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setType(s);
                    // Auto-fill label with the slot's display text unless
                    // the user has already typed something custom.
                    if (
                      !label ||
                      Object.values(SLOT_LABELS).some(
                        (v) => v.en === label || v.bn === label,
                      )
                    ) {
                      setLabel(SLOT_LABELS[s][lang === "bn" ? "bn" : "en"]);
                    }
                  }}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition " +
                    (type === s
                      ? "border-primary bg-primary text-white"
                      : "border-ink-300 bg-white hover:bg-ink-100 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900")
                  }
                >
                  {SLOT_LABELS[s][lang === "bn" ? "bn" : "en"]}
                  {save && s !== type && null}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
              {t("লেবেল", "Label")}
            </label>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("বাড়ি / অফিস / মা-বাড়ি", "Home / Office / Mom's")}
            />
          </div>
        </>
      )}

      {/* ── Full address (the only user-typed address data) ───── */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
          {t("সম্পূর্ণ ঠিকানা", "Full address")} *
        </label>
        <textarea
          className="block w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm transition placeholder:text-ink-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900"
          rows={3}
          placeholder={t(
            "হোল্ডিং নম্বর, রাস্তা, এলাকা...",
            "House #, street, area...",
          )}
          value={fullText}
          onChange={handleTextareaChange}
        />
        {trimmed.length > 0 && trimmed.length < 5 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("আরো বিস্তারিত লিখুন", "Please add more detail")}
          </p>
        )}
      </div>

      {/* ── Map picker (mandatory pin) ────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink-700 dark:text-ink-200">
            <MapPin className="h-4 w-4 text-primary" />
            {t("ম্যাপে পিন দিন", "Pick on map")} *
          </div>
          {hasPin ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
              {t("পিন সেট হয়েছে", "Pin set")}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              {t("পিন প্রয়োজন", "Pin needed")}
            </span>
          )}
        </div>
        <div className="h-64 overflow-hidden rounded-lg border border-ink-200 sm:h-72 dark:border-ink-300">
          {hasPin ? (
            <LeafletMap
              value={{ lat: lat as number, lng: lng as number }}
              onChange={(p) => {
                setLat(p.lat);
                setLng(p.lng);
              }}
            />
          ) : (
            // First-time render: still need a map for the user to drop a
            // pin. Default to a sensible center (Cumilla, BD — the same
            // default LeafletMap uses internally).
            <LeafletMap
              value={{
                lat: DEFAULT_CENTER.lat,
                lng: DEFAULT_CENTER.lng,
              }}
              onChange={(p) => {
                setLat(p.lat);
                setLng(p.lng);
              }}
            />
          )}
        </div>
        {showGpsButton && (
          <button
            type="button"
            onClick={handleGps}
            disabled={gpsBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50"
          >
            {gpsBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Crosshair className="h-3.5 w-3.5" />
            )}
            {t("বর্তমান লোকেশন ব্যবহার", "Use current location")}
          </button>
        )}
        <p className="text-[11px] text-ink-500">
          {t(
            "পিন ছাড়া ডেলিভারি ফি ও জোন সঠিকভাবে নির্ণয় হবে না।",
            "Without a pin the delivery fee and zone cannot be calculated accurately.",
          )}
        </p>
      </div>

      {/* ── Live delivery fee + zone readout (optional) ───────── */}
      {typeof cartSubtotal === "number" && (
        <div className="rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2 text-xs text-ink-700 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900">
          {feeQuery.isLoading ? (
            <span className="inline-flex items-center gap-1.5 text-ink-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("হিসাব হচ্ছে...", "Calculating...")}
            </span>
          ) : feeQuery.data?.outsideAllZones ? (
            <span className="text-amber-700 dark:text-amber-300">
              {t("জোনের বাইরে", "Outside all delivery zones")}
            </span>
          ) : feeQuery.data?.deliveryFee != null ? (
            <span>
              {t("ডেলিভারি ফি", "Delivery fee")}:{" "}
              <strong>
                ৳{feeQuery.data.deliveryFee.toLocaleString("en-IN")}
              </strong>
            </span>
          ) : (
            <span className="text-ink-500">
              {t("পিন দিলে ডেলিভারি ফি দেখাবে", "Drop a pin to see delivery fee")}
            </span>
          )}
        </div>
      )}

      {/* ── Save toggle (optional) ────────────────────────────── */}
      {showSaveToggle && (
        <label className="flex items-center gap-2 text-xs text-ink-700 dark:text-ink-200">
          <input
            type="checkbox"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-primary focus:ring-primary"
          />
          {t("এই ঠিকানাটি সংরক্ষণ করুন", "Save this address")}
        </label>
      )}

      {/* ── Submit row (optional) ─────────────────────────────── */}
      {!hideSubmitButton &&
        (renderSubmit
          ? renderSubmit({ canSubmit: valid, submitting, submit: handleSubmit })
          : onSubmit && (
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!valid || submitting}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("সংরক্ষণ করুন", "Save")
                  )}
                </button>
              </div>
            ))}
    </form>
  );
}
