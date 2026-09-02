"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  Home,
  Building2,
  Pin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useTheme } from "@/lib/theme";
import {
  AddressType,
  CustomerAddress,
  deleteAddress,
  invalidateAddressCaches,
  updateAddress,
  useAddresses,
} from "@/lib/addresses";
import { extractApiMessage } from "@/lib/api";
import { AddressFormModal } from "@/components/addresses/address-form-modal";

const SLOT_META: Record<
  AddressType,
  {
    bn: string;
    en: string;
    Icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
  }
> = {
  HOME: {
    bn: "বাড়ি",
    en: "Home",
    Icon: Home,
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  OFFICE: {
    bn: "অফিস",
    en: "Office",
    Icon: Building2,
    badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  OTHER: {
    bn: "অন্যান্য",
    en: "Other",
    Icon: Pin,
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
};

export default function AccountAddressesPage() {
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const { data: addresses, isLoading } = useAddresses();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [defaultType, setDefaultType] = useState<AddressType | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<CustomerAddress | null>(null);
  const [busy, setBusy] = useState(false);

  function openAdd(type?: AddressType) {
    setEditing(null);
    setDefaultType(type);
    setModalOpen(true);
  }
  function openEdit(a: CustomerAddress) {
    setEditing(a);
    setDefaultType(undefined);
    setModalOpen(true);
  }

  async function handleDelete(a: CustomerAddress) {
    setBusy(true);
    try {
      await deleteAddress(a.id);
      await invalidateAddressCaches(qc);
      toast.success(t("ঠিকানা মুছে ফেলা হয়েছে", "Address deleted"));
      setConfirmDelete(null);
    } catch (e) {
      toast.error(extractApiMessage(e, "Delete failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(a: CustomerAddress) {
    if (a.isDefault) return;
    setBusy(true);
    try {
      await updateAddress(a.id, { isDefault: true });
      await invalidateAddressCaches(qc);
    } catch (e) {
      toast.error(extractApiMessage(e, "Update failed"));
    } finally {
      setBusy(false);
    }
  }

  // Slot occupancy map → drives the "+ Add Home / Office / Other" buttons.
  const slotFilled: Partial<Record<AddressType, CustomerAddress>> = {};
  for (const a of addresses ?? []) slotFilled[a.type] = a;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>{t("সংরক্ষিত ঠিকানা", "Saved addresses")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "চেকআউটে দ্রুত ব্যবহারের জন্য আপনার ঠিকানাগুলো এখানে রাখুন",
                "Save addresses here for faster checkout",
              )}
            </p>
          </div>
          {/* Slot-targeted "+ Add Home / Office / Other" buttons.
              On mobile they live in a horizontal scroll strip so each
              button keeps its full label and icon instead of crowding
              the card title into a tiny column. On desktop they wrap
              into a vertical button group beside the title. */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {(Object.keys(SLOT_META) as AddressType[]).map((type) => {
              const Meta = SLOT_META[type];
              const filled = !!slotFilled[type];
              return (
                <Button
                  key={type}
                  size="sm"
                  variant={filled ? "outline" : "default"}
                  disabled={filled}
                  onClick={() => openAdd(type)}
                  className="shrink-0 whitespace-nowrap"
                  title={
                    filled
                      ? t(
                          `আপনার কাছে ইতিমধ্যে ${Meta.bn} ঠিকানা আছে — এটি সম্পাদনা করুন`,
                          `You already have an ${Meta.en} address — edit that one instead`,
                        )
                      : t(`${Meta.bn} ঠিকানা যোগ করুন`, `Add ${Meta.en} address`)
                  }
                >
                  <Plus className="h-4 w-4" />
                  <Meta.Icon className="h-4 w-4" />
                  {t(`${Meta.bn} যোগ`, `Add ${Meta.en}`)}
                </Button>
              );
            })}
          </div>
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
              <Button variant="outline" size="sm" onClick={() => openAdd()}>
                <Plus className="h-4 w-4" />
                {t("প্রথম ঠিকানা যোগ করুন", "Add your first address")}
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {addresses.map((a) => {
                const Meta = SLOT_META[a.type];
                return (
                  <li
                    key={a.id}
                    className="flex flex-col gap-3 rounded-lg border border-ink-200 p-3 dark:border-ink-300 sm:flex-row sm:items-start"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${Meta.badgeClass}`}
                      >
                        {a.isDefault ? (
                          <Star className="h-4 w-4 fill-current" />
                        ) : (
                          <Meta.Icon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Slot badge */}
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${Meta.badgeClass}`}
                          >
                            <Meta.Icon className="h-3 w-3" />
                            {t(Meta.bn, Meta.en)}
                          </span>
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
                    </div>
                    {/* Action buttons sit on their own row on mobile so
                        they don't squeeze the address text; on tablet+
                        they line up on the right edge. */}
                    <div className="flex shrink-0 items-center justify-end gap-1 sm:justify-start">
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
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit modal — shared with the checkout step */}
      <AddressFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        defaultType={defaultType}
        onSaved={async () => {
          await invalidateAddressCaches(qc);
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
