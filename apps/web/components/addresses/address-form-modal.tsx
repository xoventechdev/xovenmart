"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { MapPin, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import {
  AddressPayload,
  AddressType,
  CustomerAddress,
  createAddress,
  invalidateAddressCaches,
  updateAddress,
} from "@/lib/addresses";
import { ApiError } from "@/lib/api";
import type { DeliveryLocation } from "@/lib/location";

// Lazy-load the location step — it's a heavy leaflet bundle. Only mount
// it once the user opens the map section of the form (default collapsed).
const LocationStep = dynamic(
  () => import("@/components/map/location-step").then((m) => m.LocationStep),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
    ),
  },
);

const SLOT_LABELS: Record<AddressType, { bn: string; en: string }> = {
  HOME: { bn: "বাড়ি", en: "Home" },
  OFFICE: { bn: "অফিস", en: "Office" },
  OTHER: { bn: "অন্যান্য", en: "Other" },
};

const schema = z.object({
  type: z.enum(["HOME", "OFFICE", "OTHER"]),
  label: z.string().optional(),
  area: z.string().min(1, { message: "Area is required" }),
  landmark: z.string().optional(),
  fullText: z.string().min(5, { message: "Full address must be at least 5 characters" }),
  // Map pin is mandatory for every saved address — the backend rejects
  // null lat/lng (400) and the checkout uses the saved coordinates
  // directly when this address is picked for delivery, so a missing pin
  // would block future orders with no obvious fix.
  lat: z
    .union([z.string(), z.number()])
    .refine((v) => v !== "" && v !== null && v !== undefined, {
      message: "Drop a map pin — required to save this address",
    })
    .transform((v) => (v === "" || v == null ? undefined : v)),
  lng: z
    .union([z.string(), z.number()])
    .refine((v) => v !== "" && v !== null && v !== undefined, {
      message: "Drop a map pin — required to save this address",
    })
    .transform((v) => (v === "" || v == null ? undefined : v)),
  isDefault: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export interface AddressFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the modal is in EDIT mode and pre-fills from this row. */
  editing?: CustomerAddress | null;
  /**
   * Slot pre-selection for ADD mode (ignored when `editing` is set). Lets
   * the checkout step open the modal with "Add Home" / "Add Office" already
   * chosen so the user doesn't have to click the chip.
   */
  defaultType?: AddressType;
  /**
   * Fired after a successful save. Receives the persisted CustomerAddress.
   * The default handler also invalidates addresses + slots caches — pass
   * your own only if you need extra side effects.
   */
  onSaved?: (address: CustomerAddress) => void;
}

/**
 * Shared "Add / edit address" modal.
 *
 * Used by:
 *   - /account/addresses — full CRUD page (add, edit)
 *   - Checkout saved-address step — inline add/edit from the checkout flow
 *
 * Features:
 *   - Three-slot selector (Home / Office / Other) + free-text label for
 *     "Other"
 *   - **Map pin is REQUIRED.** Every address (Home / Office / Other) must
 *     have lat/lng so the checkout can compute the delivery fee + zone
 *     without forcing the user to re-pick on the map when they select
 *     this saved address later. The map section is open by default and
 *     the submit button stays disabled until both lat and lng are set.
 *   - RHF + zod validation (mirrors the previous /account/addresses form)
 *   - On 409 ConflictException, surfaces a friendly toast — the backend
 *     tells us which slot collided and we surface that message directly
 */
export function AddressFormModal({
  open,
  onClose,
  editing,
  defaultType,
  onSaved,
}: AddressFormModalProps) {
  const { lang } = useTheme();
  const tw = useTwin();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: defaultType ?? "HOME",
      label: "",
      area: "",
      landmark: "",
      fullText: "",
      lat: "",
      lng: "",
      isDefault: false,
    },
    mode: "onChange",
  });

  // Reset the form whenever we open for add vs edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        type: editing.type,
        label: editing.label ?? "",
        area: editing.area,
        landmark: editing.landmark ?? "",
        fullText: editing.fullText,
        lat: editing.lat != null ? String(editing.lat) : "",
        lng: editing.lng != null ? String(editing.lng) : "",
        isDefault: editing.isDefault,
      });
    } else {
      form.reset({
        type: defaultType ?? "HOME",
        label: defaultType
          ? SLOT_LABELS[defaultType][lang === "bn" ? "bn" : "en"]
          : "",
        area: "",
        landmark: "",
        fullText: "",
        lat: "",
        lng: "",
        isDefault: false,
      });
    }
    // Map section is always open — lat/lng is a required field on this form.
    setShowMap(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultType]);

  const [submitting, setSubmitting] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const slotValue = form.watch("type");
  const latVal = form.watch("lat");
  const lngVal = form.watch("lng");
  const hasPin =
    latVal !== "" &&
    latVal != null &&
    lngVal !== "" &&
    lngVal != null;

  const handleMapChange = (loc: DeliveryLocation | null) => {
    if (!loc) {
      form.setValue("lat", "");
      form.setValue("lng", "");
      return;
    }
    form.setValue("lat", String(loc.lat));
    form.setValue("lng", String(loc.lng));
    // Auto-fill area + fullText if the user hasn't typed anything yet.
    if (!form.getValues("area") && loc.area) {
      form.setValue("area", loc.area);
    }
    if (!form.getValues("fullText") && loc.fullText) {
      form.setValue("fullText", loc.fullText);
    }
  };

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      // The submit button is disabled until `hasPin` is true, so we know
      // both values are present here. Coerce defensively anyway.
      const lat =
        values.lat !== "" && values.lat != null ? Number(values.lat) : NaN;
      const lng =
        values.lng !== "" && values.lng != null ? Number(values.lng) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        toast.error(
          t(
            "ম্যাপে একটি পিন দিন — ঠিকানা সংরক্ষণ করতে হবে",
            "Drop a map pin before saving this address",
          ),
        );
        setSubmitting(false);
        return;
      }
      const payload: AddressPayload = {
        type: values.type,
        label: values.label?.trim() || null,
        area: values.area.trim(),
        landmark: values.landmark?.trim() || null,
        fullText: values.fullText.trim(),
        lat,
        lng,
        isDefault: values.isDefault || undefined,
      };
      let res;
      if (editing) {
        res = await updateAddress(editing.id, payload);
        toast.success(t("ঠিকানা আপডেট হয়েছে", "Address updated"));
      } else {
        res = await createAddress(payload);
        toast.success(t("ঠিকানা যোগ হয়েছে", "Address added"));
      }
      await invalidateAddressCaches(qc);
      onSaved?.(res.address);
      onClose();
    } catch (e) {
      // Backend returns a friendly message on 409 — surface it directly.
      if (e instanceof ApiError) {
        const msg =
          e.data?.message?.toString?.() ??
          e.data?.message ??
          e.message ??
          t("সেভ করা যায়নি", "Could not save");
        toast.error(String(msg));
      } else {
        toast.error(t("সেভ করা যায়নি", "Could not save"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editing
          ? t("ঠিকানা সম্পাদনা", "Edit address")
          : t("নতুন ঠিকানা", "New address")
      }
      className="max-w-lg"
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        {/* Slot selector (Home / Office / Other) */}
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
                  form.setValue("type", s);
                  // Auto-fill label with the slot's display text unless the
                  // user has already typed something custom.
                  const existing = form.getValues("label");
                  if (!existing || Object.values(SLOT_LABELS).some((v) => v.en === existing || v.bn === existing)) {
                    form.setValue("label", SLOT_LABELS[s][lang === "bn" ? "bn" : "en"]);
                  }
                }}
                className={
                  "rounded-full border px-3 py-1 text-xs transition " +
                  (slotValue === s
                    ? "border-primary bg-primary text-white"
                    : "border-ink-300 bg-white hover:bg-ink-100 dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900")
                }
              >
                {SLOT_LABELS[s][lang === "bn" ? "bn" : "en"]}
              </button>
            ))}
          </div>
        </div>

        {/* Free-text label — visible/editable for OTHER; for HOME/OFFICE we
            auto-derive it but still allow tweaking if needed. */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
            {t("লেবেল", "Label")}
          </label>
          <Input
            type="text"
            placeholder={t("বাড়ি / অফিস / মা-বাড়ি", "Home / Office / Mom's")}
            {...form.register("label")}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
            {t("এলাকা", "Area")} *
          </label>
          <Input
            type="text"
            placeholder={t("মুদাফরগঞ্জ", "Mudafarganj")}
            {...form.register("area")}
          />
          {form.formState.errors.area && (
            <p className="text-xs text-danger-500">
              {form.formState.errors.area.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-700 dark:text-ink-200">
            {t("ল্যান্ডমার্ক (ঐচ্ছিক)", "Landmark (optional)")}
          </label>
          <Input
            type="text"
            placeholder={t("বাজারের কাছে", "Near the bazaar")}
            {...form.register("landmark")}
          />
        </div>

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
            {...form.register("fullText")}
          />
          {form.formState.errors.fullText && (
            <p className="text-xs text-danger-500">
              {form.formState.errors.fullText.message}
            </p>
          )}
        </div>

        {/* Map picker — REQUIRED. The pin stores the lat/lng we need to
            compute the delivery fee + zone at checkout time. Without a
            pin, the saved address is useless later — the user would
            have to pick again on the map every time they used it for
            delivery. We keep the section open by default and surface a
            small status line so the user knows whether they've placed
            a pin yet. */}
        <div className="rounded-md border border-primary-200 bg-primary-50/40 px-3 py-2 dark:border-primary-700 dark:bg-primary-900/10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-ink-700 dark:text-ink-200">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {t("ম্যাপে পিন দিন (আবশ্যক)", "Drop a map pin (required)")}
            </div>
            {hasPin ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200">
                {t("পিন সেট হয়েছে", "Pin set")}
              </span>
            ) : (
              <span className="rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-semibold text-warning-800 dark:bg-warning-500/20 dark:text-warning-100">
                {t("পিন প্রয়োজন", "Pin needed")}
              </span>
            )}
          </div>
          <details
            className="mt-2"
            open={showMap}
            onToggle={(e) => setShowMap((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-[11px] text-primary-700 hover:underline dark:text-primary-100">
              {showMap
                ? t("ম্যাপ লুকান", "Hide map")
                : t("ম্যাপ খুলুন", "Open map")}
            </summary>
            <div className="mt-2">
              <LocationStep
                value={
                  hasPin
                    ? {
                        lat: Number(latVal),
                        lng: Number(lngVal),
                        fullText: form.getValues("fullText") || "",
                        line1: "",
                        area: form.getValues("area") || "",
                        city: "",
                        source: "map",
                      }
                    : null
                }
                onChange={handleMapChange}
              />
            </div>
          </details>
          <p className="mt-2 flex items-start gap-1 text-[11px] text-ink-500">
            <AlertCircle className="mt-px h-3 w-3 shrink-0" />
            {t(
              "এই পিন ছাড়া ঠিকানা সংরক্ষণ করা যাবে না। পিন দিলে ডেলিভারি ফি ও জোন সঠিকভাবে নির্ণয় হবে।",
              "A pin is required to save this address. It enables accurate delivery fee + zone calculation when you use this address for delivery later.",
            )}
          </p>
        </div>

        {/* "Save as default" — only relevant for first save or when changing
            the default row. We always show it; the backend's existing
            isDefault-flip logic handles the rest. */}
        <label className="flex items-center gap-2 text-xs text-ink-700 dark:text-ink-200">
          <input
            type="checkbox"
            {...form.register("isDefault")}
            className="h-4 w-4 rounded border-ink-300 text-primary focus:ring-primary"
          />
          {t("ডিফল্ট ঠিকানা হিসেবে সেট করুন", "Set as default address")}
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button type="submit" disabled={submitting || !hasPin}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {editing ? t("আপডেট করুন", "Update") : t("যোগ করুন", "Add")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
