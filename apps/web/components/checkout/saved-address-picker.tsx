"use client";

import { MapPin, Star } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAddresses, CustomerAddress } from "@/lib/addresses";
import { useLocationStore } from "@/lib/use-location";
import { cn } from "@/lib/utils";

/**
 * Saved-address chip picker shown above <LocationStep /> in the checkout
 * flow. Render only when the user is authenticated. Clicking a chip
 * writes the saved address into the persisted location store — which is
 * the same store <LocationStep /> reads from. The map updates
 * automatically via reverse-geocode.
 *
 * Always returns null for guests / when there are no saved addresses,
 * so the picker is a no-op for the existing guest flow.
 */
export function SavedAddressPicker() {
  const { lang } = useTheme();
  const tw = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const { data: addresses, isLoading } = useAddresses();
  const persistedLocation = useLocationStore((s) => s.location);
  const setPersistedLocation = useLocationStore((s) => s.setLocation);

  if (isLoading || !addresses?.length) return null;

  return (
    <div className="mb-4 rounded-lg border border-primary-200 bg-primary-50/40 p-3 dark:border-primary-700 dark:bg-primary-900/10">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary-700 dark:text-primary-100">
        <MapPin className="h-3.5 w-3.5" />
        {tw("সংরক্ষিত ঠিকানা থেকে বেছে নিন", "Pick a saved address")}
      </p>
      <div className="flex flex-wrap gap-2">
        {addresses.map((a) => (
          <Chip
            key={a.id}
            address={a}
            active={persistedLocation?.fullText === a.fullText}
            onPick={() =>
              setPersistedLocation({
                lat: a.lat ?? persistedLocation?.lat ?? 0,
                lng: a.lng ?? persistedLocation?.lng ?? 0,
                fullText: a.fullText,
                area: a.area,
                line1: "",
                city: "",
                source: "map",
              })
            }
            tw={tw}
          />
        ))}
        <ManageLink tw={tw} />
      </div>
    </div>
  );
}

function Chip({
  address,
  active,
  onPick,
  tw,
}: {
  address: CustomerAddress;
  active: boolean;
  onPick: () => void;
  tw: (bn: string, en: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-primary bg-primary text-white shadow-sm"
          : "border-ink-300 bg-white text-ink-700 hover:bg-ink-100 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-50",
      )}
    >
      {address.isDefault && (
        <Star className={cn("h-3 w-3", active ? "fill-white" : "fill-primary text-primary")} />
      )}
      <span className="max-w-[140px] truncate">
        {address.label || address.area}
      </span>
      {!active && (
        <span className="text-[10px] opacity-70">· {tw("বেছে নিন", "Pick")}</span>
      )}
    </button>
  );
}

function ManageLink({ tw }: { tw: (bn: string, en: string) => string }) {
  return (
    <a
      href="/account/addresses"
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-300 px-3 py-1 text-xs text-ink-500 hover:bg-ink-100 dark:border-ink-300 dark:hover:bg-ink-50"
    >
      {tw("সবগুলো দেখুন / সম্পাদনা", "Manage all")}
    </a>
  );
}