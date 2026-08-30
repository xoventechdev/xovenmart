"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as z from "zod";
import {
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useTheme } from "@/lib/theme";
import {
  AddressPayload,
  CustomerAddress,
  createAddress,
  deleteAddress,
  invalidateAddresses,
  updateAddress,
  useAddresses,
} from "@/lib/addresses";
import { ApiError } from "@/lib/api";

const PRESET_LABELS = ["Home", "Office", "Other"];

const addressSchema = z.object({
  label: z.string().optional(),
  area: z.string().min(1, { message: "Area is required" }),
  landmark: z.string().optional(),
  fullText: z.string().min(5, { message: "Full address must be at least 5 characters" }),
  lat: z.string().optional(),
  lng: z.string().optional(),
});

export default function AccountAddressesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const { data: addresses, isLoading } = useAddresses();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomerAddress | null>(null);
  const [busy, setBusy] = useState(false);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(a: CustomerAddress) {
    setEditing(a);
    setModalOpen(true);
  }

  async function handleDelete(a: CustomerAddress) {
    setBusy(true);
    try {
      await deleteAddress(a.id);
      await invalidateAddresses(qc);
      toast.success(t("ঠিকানা মুছে ফেলা হয়েছে", "Address deleted"));
      setConfirmDelete(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.data?.message ?? e.message : "Delete failed";
      toast.error(String(msg));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(a: CustomerAddress) {
    if (a.isDefault) return;
    setBusy(true);
    try {
      await updateAddress(a.id, { isDefault: true });
      await invalidateAddresses(qc);
    } catch (e) {
      const msg = e instanceof ApiError ? e.data?.message ?? e.message : "Update failed";
      toast.error(String(msg));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>{t("সংরক্ষিত ঠিকানা", "Saved addresses")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "চেকআউটে দ্রুত ব্যবহারের জন্য আপনার ঠিকানাগুলো এখানে রাখুন",
                "Save addresses here for faster checkout",
              )}
            </p>
          </div>
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4" />
            {t("নতুন যোগ করুন", "Add address")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-ink-500" />
            </div>
          ) : !addresses?.length ? (
            <div className="rounded-lg border border-dashed border-ink-300 p-8 text-center dark:border-ink-300">
              <MapPin className="mx-auto mb-2 h-8 w-8 text-ink-400" />
              <p className="mb-3 text-sm text-ink-700 dark:text-ink-900">
                {t("কোনো সংরক্ষিত ঠিকানা নেই", "No saved addresses yet")}
              </p>
              <Button variant="outline" size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                {t("প্রথম ঠিকানা যোগ করুন", "Add your first address")}
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {addresses.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg border border-ink-200 p-3 dark:border-ink-300"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
                    {a.isDefault ? (
                      <Star className="h-4 w-4 fill-current" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink-900 dark:text-ink-900">
                        {a.label || a.area}
                      </p>
                      {a.isDefault && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                          {t("ডিফল্ট", "Default")}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-500">
                      {a.area}
                      {a.landmark ? ` · ${a.landmark}` : ""}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-700 dark:text-ink-900">
                      {a.fullText}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!a.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(a)}
                        disabled={busy}
                        aria-label={t("ডিফল্ট করুন", "Set as default")}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(a)}
                      disabled={busy}
                      aria-label={t("সম্পাদনা", "Edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDelete(a)}
                      disabled={busy}
                      aria-label={t("মুছুন", "Delete")}
                      className="text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-500/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit modal */}
      <AddressFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={async () => {
          await invalidateAddresses(qc);
          setModalOpen(false);
        }}
      />

      {/* Confirm delete */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("ঠিকানা মুছে ফেলবেন?", "Delete address?")}
      >
        <p className="mb-4 text-sm text-ink-700 dark:text-ink-900">
          {t(
            "এই ঠিকানাটি মুছে ফেললে আর ফেরত পাওয়া যাবে না।",
            "This address will be permanently removed.",
          )}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={busy}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button
            variant="default"
            className="bg-danger-500 hover:bg-danger-700"
            onClick={() => confirmDelete && handleDelete(confirmDelete)}
            disabled={busy}
          >
            {busy ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("মুছে ফেলুন", "Delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AddressFormModal({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: CustomerAddress | null;
  onSaved: () => Promise<void> | void;
}) {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const form = useForm<z.infer<typeof addressSchema>>({
    resolver: zodResolver(addressSchema),
    defaultValues: { label: "", area: "", landmark: "", fullText: "", lat: "", lng: "" },
  });

  // Reset the form whenever we open for add vs edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        label: editing.label ?? "",
        area: editing.area,
        landmark: editing.landmark ?? "",
        fullText: editing.fullText,
        lat: editing.lat != null ? String(editing.lat) : "",
        lng: editing.lng != null ? String(editing.lng) : "",
      });
    } else {
      form.reset({ label: "Home", area: "", landmark: "", fullText: "", lat: "", lng: "" });
    }
  }, [open, editing]);

  const [submitting, setSubmitting] = useState(false);
  const [customLabel, setCustomLabel] = useState(false);

  const labelValue = form.watch("label");
  const labelIsPreset = PRESET_LABELS.includes(labelValue ?? "");

  async function onSubmit(values: z.infer<typeof addressSchema>) {
    setSubmitting(true);
    try {
      const payload: AddressPayload = {
        label: values.label?.trim() || null,
        area: values.area.trim(),
        landmark: values.landmark?.trim() || null,
        fullText: values.fullText.trim(),
        lat: values.lat ? Number(values.lat) : undefined,
        lng: values.lng ? Number(values.lng) : undefined,
      };
      if (editing) {
        await updateAddress(editing.id, payload);
        toast.success(t("ঠিকানা আপডেট হয়েছে", "Address updated"));
      } else {
        await createAddress(payload);
        toast.success(t("ঠিকানা যোগ হয়েছে", "Address added"));
      }
      await onSaved();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? String(e.data?.message ?? e.message ?? "")
          : t("সেভ করা যায়নি", "Could not save");
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("ঠিকানা সম্পাদনা", "Edit address") : t("নতুন ঠিকানা", "New address")}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
            {t("লেবেল", "Label")}
          </label>
          {!customLabel && !editing ? (
            <div className="flex flex-wrap gap-2">
              {PRESET_LABELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => form.setValue("label", l)}
                  className={
                    "rounded-full border px-3 py-1 text-xs transition " +
                    (labelValue === l
                      ? "border-primary bg-primary text-white"
                      : "border-ink-300 bg-white hover:bg-ink-100 dark:border-ink-300 dark:bg-ink-100")
                  }
                >
                  {l}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCustomLabel(true);
                  form.setValue("label", "");
                }}
                className="rounded-full border border-dashed border-ink-300 px-3 py-1 text-xs text-ink-500 hover:bg-ink-100"
              >
                {t("কাস্টম...", "Custom...")}
              </button>
            </div>
          ) : (
            <Input
              type="text"
              placeholder={t("বাড়ি / অফিস / মা-বাড়ি", "Home / Office / Mom's")}
              {...form.register("label")}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
            {t("এলাকা", "Area")} *
          </label>
          <Input
            type="text"
            placeholder={t("মুদাফরগঞ্জ", "Mudafarganj")}
            {...form.register("area")}
          />
          {form.formState.errors.area && (
            <p className="text-xs text-danger-500">{form.formState.errors.area.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
            {t("ল্যান্ডমার্ক (ঐচ্ছিক)", "Landmark (optional)")}
          </label>
          <Input
            type="text"
            placeholder={t("বাজারের কাছে", "Near the bazaar")}
            {...form.register("landmark")}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
            {t("সম্পূর্ণ ঠিকানা", "Full address")} *
          </label>
          <textarea
            className="block w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm transition placeholder:text-ink-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-ink-300 dark:bg-ink-100 dark:text-ink-900"
            rows={3}
            placeholder={t("হোল্ডিং নম্বর, রাস্তা, এলাকা...", "House #, street, area...")}
            {...form.register("fullText")}
          />
          {form.formState.errors.fullText && (
            <p className="text-xs text-danger-500">{form.formState.errors.fullText.message}</p>
          )}
        </div>

        <details className="rounded-md border border-ink-200 px-3 py-2 dark:border-ink-300">
          <summary className="cursor-pointer text-xs font-medium text-ink-700 dark:text-ink-900">
            {t("ম্যাপ পিন (ঐচ্ছিক)", "Map pin (optional)")}
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-ink-500">lat</label>
              <Input type="text" inputMode="decimal" placeholder="23.461" {...form.register("lat")} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-ink-500">lng</label>
              <Input type="text" inputMode="decimal" placeholder="91.182" {...form.register("lng")} />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-ink-500">
            {t(
              "ম্যাপে পিন টানলে এই দুটো ভরে যাবে — চেকআউটে দ্রুত ডেলিভারি ফি দেখাবে",
              "Drop a map pin on checkout to fill these in — enables accurate delivery fees",
            )}
          </p>
        </details>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {editing ? t("আপডেট করুন", "Update") : t("যোগ করুন", "Add")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
