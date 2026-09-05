"use client";

import { useMemo, useState } from "react";
import {
  MapPin,
  Star,
  Plus,
  ChevronDown,
  Loader2,
  Pencil,
  ExternalLink,
  X,
  Trash2,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  AddressType,
  CustomerAddress,
  deleteAddress,
  useAddresses,
  useAddressSlots,
  invalidateAddressCaches,
} from "@/lib/addresses";
import { useLocationStore, pickSavedLocation } from "@/lib/use-location";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddressFormModal } from "@/components/addresses/address-form-modal";
import { AddressCapture, AddressCaptureValue } from "@/components/addresses/address-capture";
import type { DeliveryLocation } from "@/lib/location";

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
  /** When true (default), renders a "Use a different address" CTA that
   *  opens the inline <AddressCapture> modal. Set false for the guest
   *  flow where the capture lives directly in the address step (see
   *  checkout-view.tsx). */
  showMapFallback?: boolean;
}

/**
 * Saved-address step for the checkout flow.
 *
 * Selection model — strict single-source-of-truth at the section level:
 *   - At any moment, AT MOST ONE of {a saved-address chip, an inline
 *     "use a different address" one-off} is the active source.
 *   - Tapping a saved-address chip:
 *       1. collapses any open "different address" modal,
 *       2. sets `pickedAddressId` in the location store,
 *       3. points `location.lat/lng` at the saved row's coords —
 *          the backend delivery-fee calc reads from there.
 *   - Opening "Use a different address":
 *       1. clears `pickedAddressId` (no chip is marked),
 *       2. clears `location` so we start clean,
 *       3. opens the inline modal with <AddressCapture>.
 *   - Saving the one-off in the modal → `pickSavedLocation` with
 *     pickedAddressId = null (so the chip row stays un-marked and the
 *     one-off coordinates drive the fee).
 *
 * No auto-selection: a user with a default Home address is NOT
 * pre-marked at checkout. They explicitly tap the chip or pick a
 * one-off so the fee calc never runs on stale state from a previous
 * session.
 *
 * Other UX:
 *   - Three slots: Home / Office / Other
 *   - Empty slot → "+ Add Home" / "+ Add Office" / "+ Add Other" CTA
 *   - "Manage all addresses →" link to /account/addresses
 *   - Pencil on a saved chip → inline edit modal
 *   - Trash icon → styled delete-confirm modal (copied from /account/addresses)
 */
export function SavedAddressStep({ showMapFallback = true }: Props) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const { data: addresses, isLoading: addressesLoading } = useAddresses();
  // Used to count items in the cart for the live delivery-fee quote
  // inside the one-off modal.
  const slotsQuery = useAddressSlots();

  // Use the full addresses list to map ids → rows for the byType lookup.
  const byType = useMemo(() => {
    const map: Partial<Record<AddressType, CustomerAddress>> = {};
    for (const a of addresses ?? []) map[a.type] = a;
    return map;
  }, [addresses]);

  // Picked chip — tracked by id (no more string-equality on fullText).
  const pickedId = useLocationStore((s) => s.pickedAddressId);
  const clearPicked = useLocationStore((s) => s.clearPickedAddressId);
  const setLocation = useLocationStore((s) => s.setLocation);

  const [modalFor, setModalFor] = useState<
    | { mode: "add"; type: AddressType }
    | { mode: "edit"; address: CustomerAddress }
    | null
  >(null);
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CustomerAddress | null>(
    null,
  );

  const noSaved = (addresses?.length ?? 0) === 0;
  const hasSavedPicked = !!pickedId;

  const openOneOff = () => {
    // Opening the one-off = "I want to drop a fresh pin". Forget the
    // saved-address association so the chip loses its mark.
    clearPicked();
    useLocationStore.getState().setLocation(null);
    setOneOffOpen(true);
  };

  const closeOneOff = () => setOneOffOpen(false);

  const handleOneOffSubmit = (payload: {
    fullText: string;
    lat: number;
    lng: number;
    save: boolean;
    type: AddressType;
    label: string | null;
  }) => {
    // Drop the pin into the location store with no saved-id, so the chip
    // row stays un-marked and the delivery-fee calc uses the one-off
    // coords. The address text lives in `fullText`; other DeliveryLocation
    // fields are derived / unused in the new uniform model.
    const loc: DeliveryLocation = {
      lat: payload.lat,
      lng: payload.lng,
      fullText: payload.fullText,
      line1: "",
      area: "",
      city: "",
      source: "map",
    };
    // pickedAddressId stays null — this is a one-off, not a saved pick.
    pickSavedLocation(loc, null);
    setOneOffOpen(false);
  };

  const handlePickSaved = (a: CustomerAddress) => {
    setOneOffOpen(false);
    if (a.lat == null || a.lng == null) {
      // Saved row without coords (legacy / data drift). Force the user
      // to drop a pin on the map before we can submit — open the one-off
      // modal so they can fix it without bouncing to /account/addresses.
      openOneOff();
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
                    onDelete={() => setConfirmDelete(saved)}
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

      {/* ─── "Use a different address" CTA → opens <AddressCapture> modal ─── */}
      {showMapFallback && (
        <div>
          <button
            type="button"
            onClick={openOneOff}
            className="flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline dark:text-primary-100"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {hasSavedPicked
              ? t("অন্য ঠিকানা ব্যবহার", "Use a different address")
              : noSaved
                ? t("ম্যাপে ঠিকানা লিখুন / পিন দিন", "Use map / type an address")
                : t("অন্য ঠিকানা ব্যবহার", "Use a different address")}
          </button>
          <p className="mt-1 text-[11px] text-ink-500">
            {t(
              "এই অর্ডারের জন্য একটি ভিন্ন ঠিকানা দিন (সংরক্ষণ না করেও)।",
              "Type a different address for this order only (you don't have to save it).",
            )}
          </p>
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
          // highlights and the fee calc uses it.
          if (modalFor?.mode === "add") {
            handlePickSaved(address);
          }
          setModalFor(null);
        }}
      />

      {/* ─── One-off address modal (use without saving) ─── */}
      <Modal
        open={oneOffOpen}
        onClose={closeOneOff}
        title={t("অন্য ঠিকানা ব্যবহার", "Use a different address")}
        className="max-w-lg"
      >
        <AddressCapture
          showSaveToggle
          showLabelType
          showGpsButton
          onSubmit={handleOneOffSubmit}
          renderSubmit={({ canSubmit, submit }) => (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeOneOff}
              >
                {t("বাতিল", "Cancel")}
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
              >
                {t("এই ঠিকানা ব্যবহার করুন", "Use this address")}
              </Button>
            </div>
          )}
        />
      </Modal>

      {/* ─── Delete confirmation modal ─── */}
      <DeleteConfirmModal
        target={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirmed={() => {
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/* ───────────────────── delete confirm modal ───────────────────── */

function DeleteConfirmModal({
  target,
  onClose,
  onConfirmed,
}: {
  target: CustomerAddress | null;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (!target) return null;

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteAddress(target.id);
      await invalidateAddressCaches(qc);
      toast.success(t("ঠিকানা মুছে ফেলা হয়েছে", "Address deleted"));
      onConfirmed();
      onClose();
    } catch (e: any) {
      toast.error(
        e?.data?.message ?? t("মুছে ফেলা যায়নি", "Could not delete"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!target} onClose={onClose} className="max-w-sm">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-danger-700">
          <Trash2 className="h-5 w-5" />
          <h2 className="text-lg font-semibold">
            {t("ঠিকানা মুছে ফেলবেন?", "Delete address?")}
          </h2>
        </div>
        <p className="text-sm text-ink-700 dark:text-ink-200">
          {t(
            "এই ঠিকানাটি আপনার সংরক্ষিত তালিকা থেকে মুছে যাবে। পরে আবার যোগ করতে পারবেন।",
            "This address will be removed from your saved list. You can add it again later.",
          )}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="bg-danger-600 hover:bg-danger-700 text-white"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                {t("মুছে ফেলুন", "Delete")}
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── UI bits ─────────────────────────── */

function SlotChip({
  def,
  saved,
  active,
  onPick,
  onEdit,
  onDelete,
  tw,
  lang,
}: {
  def: (typeof SLOT_DEFS)[number];
  saved: CustomerAddress;
  active: boolean;
  onPick: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="ml-1 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-50"
        aria-label={tw("সম্পাদনা", "Edit")}
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="ml-1 rounded-full p-1 text-ink-400 hover:bg-danger-50 hover:text-danger-700 dark:hover:bg-danger-900/30"
        aria-label={tw("মুছুন", "Delete")}
      >
        <Trash2 className="h-3 w-3" />
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
