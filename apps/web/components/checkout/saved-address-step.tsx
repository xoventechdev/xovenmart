"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  Star,
  Plus,
  ChevronDown,
  Loader2,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  AddressType,
  CustomerAddress,
  useAddresses,
} from "@/lib/addresses";
import { useLocationStore, pickSavedLocation } from "@/lib/use-location";
import { cn } from "@/lib/utils";
import { AddressFormModal } from "@/components/addresses/address-form-modal";
import type { DeliveryLocation } from "@/lib/location";

// Leaflet must not run on the server — dynamic-load the map step.
const LocationStep = dynamic(
  () => import("@/components/map/location-step").then((m) => m.LocationStep),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
    ),
  },
);

const SLOT_DEFS: Array<{
  type: AddressType;
  bn: string;
  en: string;
  emoji: string;
  borderClass: string;
  bgClass: string;
}> = [
  {
    type: "HOME",
    bn: "বাড়ি",
    en: "Home",
    emoji: "🏠",
    borderClass: "border-emerald-400",
    bgClass: "bg-emerald-50 dark:bg-emerald-900/30",
  },
  {
    type: "OFFICE",
    bn: "অফিস",
    en: "Office",
    emoji: "🏢",
    borderClass: "border-sky-400",
    bgClass: "bg-sky-50 dark:bg-sky-900/30",
  },
  {
    type: "OTHER",
    bn: "অন্যান্য",
    en: "Other",
    emoji: "📍",
    borderClass: "border-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-900/30",
  },
];

interface Props {
  /** When true (default), renders an inline "Use map" toggle to drop a
   *  pin without saving. Set false for the guest flow. */
  showMapFallback?: boolean;
}

/**
 * Saved-address step for the checkout flow.
 *
 * Render-only for authenticated users. Three-slot UI:
 *   - Home / Office / Other (one row of buttons)
 *   - Picked slot is highlighted + tracks the pickedAddressId in the
 *     location store (no more fragile `fullText` string compare)
 *   - When a slot is empty, a "+ Add Home" / "+ Add Office" / "+ Add Other"
 *     CTA replaces it
 *   - Always shows a "Use map / enter manually" toggle that reveals the
 *     existing <LocationStep /> + landmark form (kept for users who don't
 *     want any saved address, or who want to override)
 *   - "Manage all addresses →" link to /account/addresses
 */
export function SavedAddressStep({ showMapFallback = true }: Props) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: addresses, isLoading: addressesLoading } = useAddresses();

  // Use the full addresses list to map ids → rows for the byType lookup.
  // (The slots summary endpoint is also available via useAddressSlots()
  // if a future feature needs just the booleans without the rows.)
  const byType = useMemo(() => {
    const map: Partial<Record<AddressType, CustomerAddress>> = {};
    for (const a of addresses ?? []) map[a.type] = a;
    return map;
  }, [addresses]);

  // Picked chip — tracked by id (no more string-equality on fullText).
  const pickedId = useLocationStore((s) => s.pickedAddressId);
  const clearPicked = useLocationStore((s) => s.clearPickedAddressId);

  const [modalFor, setModalFor] = useState<
    | { mode: "add"; type: AddressType }
    | { mode: "edit"; address: CustomerAddress }
    | null
  >(null);
  const [mapOpen, setMapOpen] = useState(false);

  // Auto-open map fallback the first time the user has no saved addresses,
  // so they're never stuck on a blank step.
  // (We avoid auto-opening if the user has at least one saved row — they
  // can toggle the map themselves if they want to override.)
  const noSaved = (addresses?.length ?? 0) === 0;
  const firstRenderNoSaved = useFirstNoSaved(noSaved);

  // Show the map fallback by default when there are no saved addresses.
  const mapShouldBeOpen = mapOpen || (firstRenderNoSaved && showMapFallback);

  const handlePickSaved = (a: CustomerAddress) => {
    if (!a.lat || !a.lng) {
      // No map pin — just copy the text fields. The map stays at its
      // current center.
      const loc: DeliveryLocation = {
        lat: 0,
        lng: 0,
        fullText: a.fullText,
        line1: "",
        area: a.area,
        city: "",
        source: "map",
      };
      pickSavedLocation(loc, a.id);
      // If we don't have coords, the backend will reject the fee calc —
      // so force-open the map so the user can drop a pin.
      setMapOpen(true);
      return;
    }
    const loc: DeliveryLocation = {
      lat: a.lat,
      lng: a.lng,
      fullText: a.fullText,
      line1: "",
      area: a.area,
      city: "",
      source: "map",
    };
    pickSavedLocation(loc, a.id);
  };

  return (
    <div className="space-y-4">
      {/* ─── 3-slot chip row ─── */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-100">
          <MapPin className="h-3.5 w-3.5" />
          {t("সংরক্ষিত ঠিকানা", "Saved address")}
        </div>
        {addressesLoading ? (
          <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("লোড হচ্ছে...", "Loading...")}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {SLOT_DEFS.map((def) => {
              const saved = byType[def.type];
              const active = !!saved && pickedId === saved.id;
              if (saved) {
                return (
                  <SlotChip
                    key={def.type}
                    def={def}
                    saved={saved}
                    active={active}
                    onPick={() => handlePickSaved(saved)}
                    onEdit={() => setModalFor({ mode: "edit", address: saved })}
                    tw={t}
                    lang={lang}
                  />
                );
              }
              // Empty slot → "+ Add X" CTA
              return (
                <AddSlotCTA
                  key={def.type}
                  def={def}
                  onClick={() => setModalFor({ mode: "add", type: def.type })}
                  tw={t}
                />
              );
            })}
            <ManageLink tw={t} />
          </div>
        )}
      </div>

      {/* ─── "Use map / enter manually" toggle ─── */}
      {showMapFallback && (
        <div>
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline dark:text-primary-100"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                mapShouldBeOpen && "rotate-180",
              )}
            />
            {mapShouldBeOpen
              ? t("ম্যাপ বন্ধ করুন", "Hide map")
              : noSaved
                ? t("ম্যাপে ঠিকানা লিখুন / পিন দিন", "Use map / type an address")
                : t("অন্য ঠিকানা ব্যবহার (ম্যাপ)", "Use a different address (map)")}
          </button>
          {mapShouldBeOpen && (
            <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50/30 p-3 dark:border-ink-700 dark:bg-ink-900/30">
              <LocationStepWrapper
                onPickMap={() => {
                  // When the user manually picks a new pin, clear the
                  // saved-address association so the order doesn't claim
                  // a slot it isn't using.
                  clearPicked();
                  setMapOpen(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ─── Inline add / edit modal ─── */}
      <AddressFormModal
        open={modalFor !== null}
        onClose={() => setModalFor(null)}
        editing={modalFor?.mode === "edit" ? modalFor.address : null}
        defaultType={modalFor?.mode === "add" ? modalFor.type : undefined}
        onSaved={(address) => {
          // After adding, immediately pick the new address so the chip
          // highlights and the map center updates.
          if (modalFor?.mode === "add") {
            handlePickSaved(address);
          }
          setModalFor(null);
        }}
      />
    </div>
  );
}

/**
 * Inner wrapper around <LocationStep />. We import it lazily so the leaflet
 * bundle only ships when the user opens the map. The wrapper just lets the
 * parent observe "the user picked a fresh location" (no saved association).
 */
function LocationStepWrapper({ onPickMap }: { onPickMap: () => void }) {
  const location = useLocationStore((s) => s.location);
  const setLocation = useLocationStore((s) => s.setLocation);

  return (
    <LocationStep
      value={location}
      onChange={(loc) => {
        if (loc) {
          setLocation(loc);
          onPickMap();
        } else {
          setLocation(null);
        }
      }}
    />
  );
}

/* ─────────────────────────── UI bits ─────────────────────────── */

function SlotChip({
  def,
  saved,
  active,
  onPick,
  onEdit,
  tw,
  lang,
}: {
  def: (typeof SLOT_DEFS)[number];
  saved: CustomerAddress;
  active: boolean;
  onPick: () => void;
  onEdit: () => void;
  tw: (bn: string, en: string) => string;
  lang: "bn" | "en";
}) {
  return (
    <div
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border-2 pl-2 pr-1 py-1 text-xs font-medium transition",
        active
          ? `${def.borderClass} ${def.bgClass} text-ink-900 dark:text-ink-900 shadow-sm`
          : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900",
      )}
    >
      <button
        type="button"
        onClick={onPick}
        aria-pressed={active}
        className="inline-flex items-center gap-1.5"
      >
        <span aria-hidden>{def.emoji}</span>
        <span>{lang === "bn" ? def.bn : def.en}</span>
        {saved.isDefault && (
          <Star
            className={cn(
              "h-3 w-3",
              active ? "fill-amber-500 text-amber-500" : "fill-amber-400 text-amber-400",
            )}
          />
        )}
        <span className="max-w-[140px] truncate text-[11px] text-ink-500">
          {saved.area}
        </span>
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="ml-1 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-50"
        aria-label={tw("সম্পাদনা", "Edit")}
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function AddSlotCTA({
  def,
  onClick,
  tw,
}: {
  def: (typeof SLOT_DEFS)[number];
  onClick: () => void;
  tw: (bn: string, en: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-ink-300 px-3 py-1 text-xs font-medium text-ink-500 hover:border-primary hover:text-primary dark:border-ink-300 dark:text-ink-500"
    >
      <Plus className="h-3 w-3" />
      <span aria-hidden>{def.emoji}</span>
      <span>{tw(`+ ${def.bn}`, `+ ${def.en}`)}</span>
    </button>
  );
}

function ManageLink({ tw }: { tw: (bn: string, en: string) => string }) {
  return (
    <a
      href="/account/addresses"
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-300 px-3 py-1 text-xs text-ink-500 hover:bg-ink-100 dark:border-ink-300 dark:hover:bg-ink-50"
    >
      <ExternalLink className="h-3 w-3" />
      {tw("সবগুলো দেখুন / সম্পাদনা", "Manage all")}
    </a>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

import { useEffect, useRef } from "react";

/**
 * Returns `true` once on the first render where `cond` is true. Used so we
 * can auto-open the map fallback the first time the user has no saved
 * addresses, without re-opening it every time they delete their last row.
 */
function useFirstNoSaved(cond: boolean) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (cond) firedRef.current = true;
  }, [cond]);
  return firedRef.current;
}
