"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Star,
  Pencil,
  Plus,
  Trash2,
  Package,
  ShoppingBag,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ProductLink {
  productId: string;
  isPrimary: boolean;
  unitCost: number | null;
  createdAt: string;
  product?: {
    id: string;
    sku: string;
    slug: string;
    nameBn: string;
    nameEn: string;
    isActive: boolean;
    category?: { nameEn: string; nameBn: string };
  };
}

interface OrderLink {
  orderItemId: string;
  supplierId: string;
  qty: number;
  unitCost: number | null;
  note: string | null;
  recordedAt: string;
  orderItem?: {
    id: string;
    qty: number;
    nameSnapshot: string;
    order?: {
      id: string;
      orderNo: string;
      status: string;
      placedAt: string;
    };
  };
}

interface SupplierDetail {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  addressBn?: string | null;
  addressEn?: string | null;
  area?: string | null;
  notesBn?: string | null;
  notesEn?: string | null;
  rating: number;
  isActive: boolean;
  sortOrder: number;
  productLinks: ProductLink[];
  itemLinks: OrderLink[];
  createdAt: string;
  updatedAt: string;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i <= value ? "fill-accent-500 text-accent-500" : "text-ink-300",
          )}
        />
      ))}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary-700 text-primary-700"
          : "border-transparent text-ink-500 hover:text-ink-900",
      )}
    >
      {children}
    </button>
  );
}

export function SupplierDetail({ id }: { id: string }) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [tab, setTab] = useState<"overview" | "products" | "orders">("overview");
  const [addProductOpen, setAddProductOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "supplier", id],
    queryFn: () => api.get(`/admin/suppliers/${id}`),
    enabled: !!id,
  });

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) =>
      api.patch(`/admin/suppliers/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "supplier", id] });
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      toast.success(t("আপডেট হয়েছে", "Updated"));
    },
  });

  const removeProductLink = useMutation({
    mutationFn: (productId: string) =>
      api.delete(`/admin/suppliers/${id}/products/${productId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "supplier", id] });
      toast.success(t("লিংক মুছে ফেলা হয়েছে", "Link removed"));
    },
  });

  const togglePrimary = useMutation({
    mutationFn: (vars: { productId: string; isPrimary: boolean }) =>
      api.patch(`/admin/suppliers/${id}/products/${vars.productId}`, {
        isPrimary: vars.isPrimary,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "supplier", id] });
    },
  });

  const updateUnitCost = useMutation({
    mutationFn: (vars: { productId: string; unitCost: number | null }) =>
      api.patch(`/admin/suppliers/${id}/products/${vars.productId}`, {
        unitCost: vars.unitCost,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "supplier", id] });
      toast.success(t("ইউনিট খরচ আপডেট হয়েছে", "Unit cost updated"));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
        <div className="h-64 animate-pulse rounded bg-ink-100 dark:bg-ink-200" />
      </div>
    );
  }

  const s = data as SupplierDetail | undefined;
  if (!s) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-ink-500">
          {t("সরবরাহকারী পাওয়া যায়নি", "Supplier not found")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-800 dark:text-primary-100">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-900">
              {lang === "bn" ? s.nameBn : s.nameEn}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className="font-mono">{s.slug}</span>
              <span>•</span>
              <Stars value={s.rating ?? 3} />
              <span>•</span>
              {s.isActive ? (
                <Badge variant="success">{t("সক্রিয়", "Active")}</Badge>
              ) : (
                <Badge variant="muted">{t("নিষ্ক্রিয়", "Inactive")}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => toggleActive.mutate(!s.isActive)}
            disabled={toggleActive.isPending}
          >
            {s.isActive
              ? t("নিষ্ক্রিয় করুন", "Deactivate")
              : t("সক্রিয় করুন", "Activate")}
          </Button>
          <Link href={`/admin/suppliers/${s.id}/edit`}>
            <Button>
              <Pencil className="h-4 w-4" /> {t("সম্পাদনা", "Edit")}
            </Button>
          </Link>
        </div>
      </div>

      <div className="border-b border-ink-200 dark:border-ink-300">
        <div className="flex gap-1">
          <TabButton
            active={tab === "overview"}
            onClick={() => setTab("overview")}
          >
            {t("সারসংক্ষেপ", "Overview")}
          </TabButton>
          <TabButton
            active={tab === "products"}
            onClick={() => setTab("products")}
          >
            <Package className="mr-1 inline h-4 w-4" />{" "}
            {t("পণ্য", "Products")} ({s.productLinks?.length ?? 0})
          </TabButton>
          <TabButton
            active={tab === "orders"}
            onClick={() => setTab("orders")}
          >
            <ShoppingBag className="mr-1 inline h-4 w-4" />{" "}
            {t("অর্ডার লিংক", "Order Links")} ({s.itemLinks?.length ?? 0})
          </TabButton>
        </div>
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("যোগাযোগ", "Contact")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {s.contactName && (
                <div>
                  <div className="text-xs text-ink-500">
                    {t("যোগাযোগের নাম", "Contact")}
                  </div>
                  <div className="font-medium">{s.contactName}</div>
                </div>
              )}
              {s.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-ink-400" />
                  <a href={`tel:${s.phone}`} className="text-primary-700">
                    {s.phone}
                  </a>
                </div>
              )}
              {s.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-ink-400" />
                  <a href={`mailto:${s.email}`} className="text-primary-700">
                    {s.email}
                  </a>
                </div>
              )}
              {s.area && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-ink-400" />
                  {s.area}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("ঠিকানা", "Address")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {s.addressEn && (
                <div>
                  <div className="text-xs text-ink-500">EN</div>
                  <div className="whitespace-pre-wrap">{s.addressEn}</div>
                </div>
              )}
              {s.addressBn && (
                <div>
                  <div className="text-xs text-ink-500">বাংলা</div>
                  <div className="whitespace-pre-wrap">{s.addressBn}</div>
                </div>
              )}
              {!s.addressEn && !s.addressBn && (
                <div className="text-ink-500">—</div>
              )}
            </CardContent>
          </Card>

          {(s.notesEn || s.notesBn) && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>{t("নোট", "Notes")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {s.notesEn && (
                  <div>
                    <div className="text-xs text-ink-500">EN</div>
                    <div className="whitespace-pre-wrap">{s.notesEn}</div>
                  </div>
                )}
                {s.notesBn && (
                  <div>
                    <div className="text-xs text-ink-500">বাংলা</div>
                    <div className="whitespace-pre-wrap">{s.notesBn}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t("মেটা", "Meta")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
              <div>
                <div className="text-ink-500">
                  {t("সর্ট অর্ডার", "Sort order")}
                </div>
                <div className="font-mono">{s.sortOrder}</div>
              </div>
              <div>
                <div className="text-ink-500">{t("তৈরি", "Created")}</div>
                <div>{new Date(s.createdAt).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-ink-500">{t("আপডেট", "Updated")}</div>
                <div>{new Date(s.updatedAt).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-ink-500">{t("রেটিং", "Rating")}</div>
                <div>{s.rating}/5</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "products" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("যুক্ত পণ্য", "Linked Products")}</CardTitle>
              <Button size="sm" onClick={() => setAddProductOpen(true)}>
                <Plus className="h-4 w-4" /> {t("পণ্য যোগ", "Add Product")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!s.productLinks || s.productLinks.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-500">
                {t("কোন পণ্য যুক্ত নেই", "No linked products")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-500 dark:border-ink-300 dark:bg-ink-100">
                      <th className="px-3 py-2">{t("পণ্য", "Product")}</th>
                      <th className="px-3 py-2">{t("ক্যাটাগরি", "Category")}</th>
                      <th className="px-3 py-2">{t("প্রাইমারি", "Primary")}</th>
                      <th className="px-3 py-2 text-right">
                        {t("ইউনিট খরচ", "Unit cost")}
                      </th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.productLinks.map((pl) => (
                      <ProductLinkRow
                        key={pl.productId}
                        pl={pl}
                        lang={lang}
                        onTogglePrimary={(v) =>
                          togglePrimary.mutate({
                            productId: pl.productId,
                            isPrimary: v,
                          })
                        }
                        onRemove={() => removeProductLink.mutate(pl.productId)}
                        onSaveUnitCost={(c) =>
                          updateUnitCost.mutate({
                            productId: pl.productId,
                            unitCost: c,
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "orders" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("সাম্প্রতিক অর্ডার লিংক", "Recent Order Links")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!s.itemLinks || s.itemLinks.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-500">
                {t("কোন অর্ডার লিংক নেই", "No order links yet")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase text-ink-500 dark:border-ink-300 dark:bg-ink-100">
                      <th className="px-3 py-2">{t("অর্ডার", "Order")}</th>
                      <th className="px-3 py-2">{t("পণ্য", "Product")}</th>
                      <th className="px-3 py-2 text-right">{t("পরিমাণ", "Qty")}</th>
                      <th className="px-3 py-2 text-right">
                        {t("ইউনিট খরচ", "Unit cost")}
                      </th>
                      <th className="px-3 py-2">{t("নোট", "Note")}</th>
                      <th className="px-3 py-2">{t("সময়", "When")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.itemLinks.map((il) => (
                      <tr
                        key={il.orderItemId}
                        className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                      >
                        <td className="px-3 py-2">
                          {il.orderItem?.order ? (
                            <Link
                              href={`/admin/orders/detail/${il.orderItem.order.id}`}
                              className="font-mono text-primary-700"
                            >
                              {il.orderItem.order.orderNo}
                            </Link>
                          ) : (
                            "—"
                          )}
                          <div className="text-[10px] text-ink-500">
                            {il.orderItem?.order?.status}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {il.orderItem?.nameSnapshot ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {il.qty}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {il.unitCost != null
                            ? `৳${Number(il.unitCost).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">{il.note ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {new Date(il.recordedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {addProductOpen && (
        <AddProductDialog
          supplierId={id}
          onClose={() => setAddProductOpen(false)}
        />
      )}
    </div>
  );
}

function AddProductDialog({
  supplierId,
  onClose,
}: {
  supplierId: string;
  onClose: () => void;
}) {
  const { lang } = useTheme();
  const qc = useQueryClient();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);
  const [productId, setProductId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [unitCost, setUnitCost] = useState("");

  const { data: products } = useQuery({
    queryKey: ["admin", "products", "all-for-picker"],
    queryFn: () => api.get("/admin/products?perPage=500"),
  });

  const add = useMutation({
    mutationFn: () =>
      api.post(`/admin/suppliers/${supplierId}/products`, {
        productId,
        isPrimary,
        unitCost: unitCost ? Number(unitCost) : undefined,
      }),
    onSuccess: () => {
      toast.success(t("পণ্য যোগ হয়েছে", "Product linked"));
      qc.invalidateQueries({ queryKey: ["admin", "supplier", supplierId] });
      qc.invalidateQueries({ queryKey: ["admin", "suppliers"] });
      onClose();
    },
    onError: (e: any) => {
      const msg =
        e?.data?.message?.toString?.() ??
        (Array.isArray(e?.data?.message) ? e.data.message.join(", ") : null) ??
        t("যোগ ব্যর্থ", "Add failed");
      toast.error(msg);
    },
  });

  const items: any[] = (products?.items ?? []) as any;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-ink-50"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-300">
          <h2 className="font-semibold">{t("পণ্য যোগ করুন", "Add Product")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <label className="text-sm font-medium">
              {t("পণ্য", "Product")}
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-100"
            >
              <option value="">{t("পণ্য নির্বাচন...", "Select product...")}</option>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === "bn" ? p.nameBn : p.nameEn} ({p.sku})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">
              {t("ইউনিট খরচ (ঐচ্ছিক)", "Unit cost (optional)")}
            </label>
            <Input
              type="number"
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="mt-1.5"
              placeholder="0.00"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-primary-700"
            />
            <span className="text-sm">
              {t("প্রাইমারি সরবরাহকারী", "Primary supplier for this product")}
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-200 p-3 dark:border-ink-300">
          <Button variant="outline" onClick={onClose}>
            {t("বাতিল", "Cancel")}
          </Button>
          <Button
            onClick={() => add.mutate()}
            disabled={!productId || add.isPending}
          >
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("যোগ করুন", "Add")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductLinkRow({
  pl,
  lang,
  onTogglePrimary,
  onRemove,
  onSaveUnitCost,
}: {
  pl: ProductLink;
  lang: "bn" | "en";
  onTogglePrimary: (v: boolean) => void;
  onRemove: () => void;
  onSaveUnitCost: (c: number | null) => void;
}) {
  const [costEdit, setCostEdit] = useState(
    pl.unitCost != null ? String(pl.unitCost) : "",
  );
  const [editing, setEditing] = useState(false);
  const p = pl.product;
  return (
    <tr className="border-b border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100">
      <td className="px-3 py-2">
        <div className="font-semibold">
          {p ? (lang === "bn" ? p.nameBn : p.nameEn) : "—"}
        </div>
        <div className="font-mono text-[10px] text-ink-500">
          {p?.sku} · {p?.slug}
        </div>
      </td>
      <td className="px-3 py-2 text-xs">
        {p?.category
          ? lang === "bn"
            ? p.category.nameBn
            : p.category.nameEn
          : "—"}
      </td>
      <td className="px-3 py-2">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={pl.isPrimary}
            onChange={(e) => onTogglePrimary(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-primary-700"
          />
          <span className="text-xs">{pl.isPrimary ? "★" : "—"}</span>
        </label>
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              value={costEdit}
              onChange={(e) => setCostEdit(e.target.value)}
              className="h-7 w-24 text-right"
              type="number"
              step="0.01"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                const v = costEdit.trim();
                onSaveUnitCost(v === "" ? null : Number(v));
                setEditing(false);
              }}
            >
              <Save className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setCostEdit(pl.unitCost != null ? String(pl.unitCost) : "");
                setEditing(false);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="font-mono text-xs hover:underline"
          >
            {pl.unitCost != null
              ? `৳${Number(pl.unitCost).toLocaleString()}`
              : "—"}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-danger-700" />
        </Button>
      </td>
    </tr>
  );
}
