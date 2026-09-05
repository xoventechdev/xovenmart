"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTheme } from "@/lib/theme";
import {
  AddressPayload,
  CustomerAddress,
  createAddress,
  invalidateAddressCaches,
  updateAddress,
} from "@/lib/addresses";
import { ApiError } from "@/lib/api";
import { AddressCapture, AddressCaptureValue } from "@/components/addresses/address-capture";

// Single source of truth for "user provides an address" lives in
// <AddressCapture>. This modal is just a thin shell — it owns the RHF
// form state for `isDefault` (the only thing not inside the capture
// component), wires the capture output to the backend payload, and
// surfaces backend errors (e.g. 409 slot collision) via toast.
//
// The form no longer asks for `area` or `landmark`. The backend will
// default `area` to "—" when the payload omits it (see customers.service.ts).

const schema = z.object({
  fullText: z
    .string()
    .min(5, { message: "Full address must be at least 5 characters" }),
  // Map pin is mandatory — the capture component refuses to fire
  // onSubmit until both lat/lng are set, so by the time we get here
  // we know they're present.
  lat: z.number().refine((v) => Number.isFinite(v), {
    message: "Drop a map pin — required to save this address",
  }),
  lng: z.number().refine((v) => Number.isFinite(v), {
    message: "Drop a map pin — required to save this address",
  }),
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
  defaultType?: import("@/lib/addresses").AddressType;
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
 * Behavior:
 *   - Three-slot selector (Home / Office / Other) + free-text label
 *   - **Map pin is REQUIRED.** <AddressCapture> gates submit on the pin.
 *   - On 409 ConflictException, surfaces a friendly toast — the backend
 *     tells us which slot collided and we surface that message directly.
 */
export function AddressFormModal({
  open,
  onClose,
  editing,
  defaultType,
  onSaved,
}: AddressFormModalProps) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const qc = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullText: "",
      lat: 0,
      lng: 0,
      isDefault: false,
    },
    mode: "onChange",
  });

  // Single piece of state — AddressCapture is now the source of truth for
  // fullText + lat + lng + type + label. We mirror them here so the
  // submit button can read the latest values synchronously.
  const [captureValue, setCaptureValue] = useState<AddressCaptureValue>({
    fullText: editing?.fullText ?? "",
    lat: editing?.lat ?? null,
    lng: editing?.lng ?? null,
    type: editing?.type ?? defaultType ?? "HOME",
    label: editing?.label ?? "",
  });

  // Reset every time we (re)open — keeps stale editing/defaultType values
  // from leaking into a fresh "add" flow.
  useEffect(() => {
    if (!open) return;
    setCaptureValue({
      fullText: editing?.fullText ?? "",
      lat: editing?.lat ?? null,
      lng: editing?.lng ?? null,
      type: editing?.type ?? defaultType ?? "HOME",
      label: editing?.label ?? "",
    });
    form.reset({
      fullText: editing?.fullText ?? "",
      lat: editing?.lat ?? 0,
      lng: editing?.lng ?? 0,
      isDefault: editing?.isDefault ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultType]);

  const [submitting, setSubmitting] = useState(false);

  const hasPin =
    captureValue.lat != null &&
    Number.isFinite(captureValue.lat) &&
    captureValue.lng != null &&
    Number.isFinite(captureValue.lng);
  const fullText = captureValue.fullText.trim();
  const canSubmit = hasPin && fullText.length >= 5;

  async function doSave() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const payload: AddressPayload = {
        type: captureValue.type,
        label: captureValue.label.trim() || null,
        // `area` is dropped from this form. Backend defaults it to "—"
        // when missing (no Nominatim call, no fallback chain). Leave
        // the key off the payload so `createAddress` doesn't send it.
        landmark: null,
        fullText,
        lat: captureValue.lat as number,
        lng: captureValue.lng as number,
        isDefault: form.getValues("isDefault") || undefined,
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSave();
        }}
        className="space-y-3"
      >
        <AddressCapture
          showLabelType
          showGpsButton
          defaultFullText={editing?.fullText ?? ""}
          defaultLat={editing?.lat ?? null}
          defaultLng={editing?.lng ?? null}
          defaultType={editing?.type ?? defaultType ?? "HOME"}
          defaultLabel={editing?.label ?? ""}
          // Controlled: lift the capture output to local state so we
          // can validate + submit it from the parent's button row.
          value={captureValue}
          onChange={(v) => {
            setCaptureValue(v);
            // Keep the form's hidden lat/lng in sync so RHF stays valid.
            form.setValue(
              "lat",
              v.lat != null && Number.isFinite(v.lat) ? v.lat : 0,
            );
            form.setValue(
              "lng",
              v.lng != null && Number.isFinite(v.lng) ? v.lng : 0,
            );
          }}
          hideSubmitButton
        />

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
          <Button type="submit" disabled={submitting || !canSubmit}>
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