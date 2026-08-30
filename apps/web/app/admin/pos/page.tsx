"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Search,
  Plus,
  Trash2,
  X,
  Phone,
  User,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Copy,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatBDT } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PosProduct {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  sku: string | null;
  salePrice: number;
  mrp: number | null;
  unit: string | null;
  stockQty: number;
  image: string | null;
}

interface Customer {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  referralCode: string | null;
  isBlocked: boolean;
  _count?: { orders: number; addresses: number };
}

interface CartLine {
  productId: string;
  nameEn: string;
  nameBn: string;
  unitPrice: number;
  qty: number;
  stockQty: number;
  image: string | null;
  unit: string | null;
}

const PAYMENT_METHODS: Array<{
  value: "CASH" | "COD" | "MANUAL_BKASH" | "BKASH" | "NAGAD" | "ROCKET" | "BANK";
  bn: string;
  en: string;
  hint: { bn: string; en: string };
}> = [
  { value: "CASH", bn: "নগদ", en: "Cash", hint: { bn: "কাউন্টারে হাতে হাতে", en: "Over-the-counter" } },
  { value: "COD", bn: "ক্যাশ অন ডেলিভারি", en: "Cash on Delivery", hint: { bn: "রাইডার নিয়ে যাবে", en: "Rider collects" } },
  { value: "MANUAL_BKASH", bn: "bKash (ম্যানুয়াল)", en: "bKash (Manual)", hint: { bn: "গ্রাহক নিজে পাঠিয়েছে", en: "Customer sent personally" } },
  { value: "BKASH", bn: "bKash", en: "bKash", hint: { bn: "ভবিষ্যতের API ইন্টিগ্রেশন", en: "Future API integration" } },
  { value: "NAGAD", bn: "Nagad", en: "Nagad", hint: { bn: "ভবিষ্যতের API ইন্টিগ্রেশন", en: "Future API integration" } },
  { value: "ROCKET", bn: "Rocket", en: "Rocket", hint: { bn: "ভবিষ্যতের API ইন্টিগ্রেশন", en: "Future API integration" } },
  { value: "BANK", bn: "ব্যাংক", en: "Bank", hint: { bn: "ভবিষ্যতের API ইন্টিগ্রেশন", en: "Future API integration" } },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function PosQuickOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { lang } = useTheme();
  const t = (bn: string, en: string) => (lang === "bn" ? bn : en);

  // ─── Customer ───
  const [phone, setPhone] = useState("");
  const [debouncedPhone, setDebouncedPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // ─── Address ───
  const [addressArea, setAddressArea] = useState("");
  const [addressLandmark, setAddressLandmark] = useState("");
  const [addressFullText, setAddressFullText] = useState("");
  const [addressLat, setAddressLat] = useState<string>("");
  const [addressLng, setAddressLng] = useState<string>("");

  // ─── Items ───
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  // ─── Pricing (cashier-entered) ───
  const [discountTotal, setDiscountTotal] = useState<string>("0");
  const [deliveryFee, setDeliveryFee] = useState<string>("0");

  // ─── Payment ───
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "COD" | "MANUAL_BKASH" | "BKASH" | "NAGAD" | "ROCKET" | "BANK">("CASH");
  const [markAsPaid, setMarkAsPaid] = useState(true);
  const [notes, setNotes] = useState("");

  // ─── Modal: place-order confirmation + last-placed banner ───
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placedOrderNo, setPlacedOrderNo] = useState<string | null>(null);

  // ─── Debounce phone ───
  useEffect(() => {
    const h = setTimeout(() => setDebouncedPhone(phone.trim()), 350);
    return () => clearTimeout(h);
  }, [phone]);

  // ─── Debounce product search ───
  useEffect(() => {
    const h = setTimeout(() => setDebouncedProductSearch(productSearch.trim()), 300);
    return () => clearTimeout(h);
  }, [productSearch]);

  // ─── Customer lookup (only when 11-digit phone and no customer yet) ───
  const phoneValid = /^01[3-9]\d{8}$/.test(debouncedPhone.replace(/^\+?88/, ""));
  const lookupEnabled = phoneValid && customer === null;

  const { data: lookupData, isFetching: lookupFetching } = useQuery({
    queryKey: ["admin", "pos", "lookup", debouncedPhone],
    queryFn: () => api.get(`/admin/pos/customers/lookup?phone=${encodeURIComponent(debouncedPhone.replace(/^\+?88/, ""))}`),
    enabled: lookupEnabled,
    retry: false,
  });

  useEffect(() => {
    if (!lookupEnabled) return;
    if (lookupData) {
      // null = no match. Set the customer (or null).
      setCustomer(lookupData as Customer | null);
    }
  }, [lookupData, lookupEnabled]);

  // When user edits phone after a lookup, reset customer so we re-lookup next round
  useEffect(() => {
    if (!phoneTouched) return;
    setCustomer(null);
  }, [debouncedPhone, phoneTouched]);

  // ─── Product search ───
  const productQuery = useQuery({
    queryKey: ["admin", "pos", "products", debouncedProductSearch],
    queryFn: () =>
      api.get(
        `/admin/pos/products/search?q=${encodeURIComponent(debouncedProductSearch)}&limit=12`,
      ),
    enabled: debouncedProductSearch.length >= 1,
    staleTime: 30_000,
  });
  const productResults: PosProduct[] = (productQuery.data ?? []) as PosProduct[];

  // ─── Cart ops ───
  const addToCart = (p: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((x) => x.productId === p.id);
      if (existing) {
        if (existing.qty + 1 > p.stockQty) {
          toast.error(
            t(
              `স্টক শেষ — ${p.nameEn} এ ${p.stockQty}টি আছে`,
              `Out of stock — only ${p.stockQty} of ${p.nameEn} available`,
            ),
          );
          return prev;
        }
        return prev.map((x) =>
          x.productId === p.id ? { ...x, qty: x.qty + 1, unitPrice: p.salePrice } : x,
        );
      }
      if (p.stockQty < 1) {
        toast.error(t("স্টক শেষ", "Out of stock"));
        return prev;
      }
      return [
        ...prev,
        {
          productId: p.id,
          nameEn: p.nameEn,
          nameBn: p.nameBn,
          unitPrice: p.salePrice,
          qty: 1,
          stockQty: p.stockQty,
          image: p.image,
          unit: p.unit,
        },
      ];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((x) => {
          if (x.productId !== productId) return x;
          const next = x.qty + delta;
          if (next < 1) return x;
          if (next > x.stockQty) {
            toast.error(
              t(
                `স্টক শেষ — ${x.nameEn} এ ${x.stockQty}টি আছে`,
                `Out of stock — only ${x.stockQty} of ${x.nameEn} available`,
              ),
            );
            return x;
          }
          return { ...x, qty: next };
        })
        .filter(Boolean),
    );
  };

  const removeLine = (productId: string) => {
    setCart((prev) => prev.filter((x) => x.productId !== productId));
  };

  // ─── Totals ───
  const itemSubtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
    [cart],
  );
  const discount = Math.max(0, Number(discountTotal) || 0);
  const fee = Math.max(0, Number(deliveryFee) || 0);
  const grandTotal = Math.max(0, itemSubtotal - discount + fee);

  // Auto-toggle markAsPaid based on payment method
  useEffect(() => {
    if (paymentMethod === "CASH" || paymentMethod === "MANUAL_BKASH") {
      setMarkAsPaid(true);
    } else if (paymentMethod === "COD") {
      setMarkAsPaid(false);
    }
    // For BKASH/NAGAD/ROCKET/BANK: leave it as the cashier set it
  }, [paymentMethod]);

  // ─── Place order mutation ───
  const place = useMutation({
    mutationFn: () => {
      const payload = {
        customerPhone: phone.replace(/^\+?88/, ""),
        customerName: customer ? undefined : customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        address: {
          area: addressArea.trim(),
          landmark: addressLandmark.trim() || undefined,
          fullText: addressFullText.trim(),
          lat: addressLat ? Number(addressLat) : undefined,
          lng: addressLng ? Number(addressLng) : undefined,
        },
        items: cart.map((c) => ({ productId: c.productId, qty: c.qty })),
        paymentMethod,
        subtotal: itemSubtotal,
        discountTotal: discount,
        deliveryFee: fee,
        notes: notes.trim() || undefined,
        markAsPaid,
      };
      return api.post("/admin/pos/orders", payload);
    },
    onSuccess: (res: any) => {
      const orderNo = res?.order?.orderNo;
      setPlacedOrderNo(orderNo ?? "—");
      toast.success(
        t(`অর্ডার ${orderNo} তৈরি হয়েছে`, `Order ${orderNo} placed`),
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      setConfirmOpen(false);
      // Clear cart but keep customer
      setCart([]);
      setProductSearch("");
      setDebouncedProductSearch("");
      setDiscountTotal("0");
      setDeliveryFee("0");
      setNotes("");
    },
    onError: (e: any) => {
      const raw = e?.data?.message ?? e?.message;
      const msg = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "Place order failed");
      toast.error(msg);
    },
  });

  // ─── Validation ───
  const canPlace =
    cart.length > 0 &&
    itemSubtotal > 0 &&
    addressArea.trim().length >= 2 &&
    addressFullText.trim().length >= 5 &&
    (customer !== null || customerName.trim().length >= 2);

  const openConfirm = () => {
    if (!canPlace) return;
    setConfirmOpen(true);
  };

  const resetForm = () => {
    setPhone("");
    setDebouncedPhone("");
    setCustomerName("");
    setCustomerEmail("");
    setCustomer(null);
    setPhoneTouched(false);
    setAddressArea("");
    setAddressLandmark("");
    setAddressFullText("");
    setAddressLat("");
    setAddressLng("");
    setCart([]);
    setDiscountTotal("0");
    setDeliveryFee("0");
    setNotes("");
    setPaymentMethod("CASH");
    setMarkAsPaid(true);
    setPlacedOrderNo(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900 dark:text-ink-900">
            <Calculator className="h-6 w-6 text-primary-700" />
            {t("দ্রুত অর্ডার (POS)", "Quick Order (POS)")}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {t(
              "হোয়াটসঅ্যাপ / ফোন / ওয়াক-ইন অর্ডারের জন্য",
              "For WhatsApp / phone / walk-in orders",
            )}
          </p>
        </div>
        {placedOrderNo && (
          <div className="flex items-center gap-2 rounded-md border border-success-300 bg-success-50 px-3 py-2 text-sm dark:bg-success-100">
            <CheckCircle2 className="h-4 w-4 text-success-700" />
            <span className="font-semibold text-success-700">{placedOrderNo}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(placedOrderNo);
                toast.success(t("কপি হয়েছে", "Copied"));
              }}
              className="text-success-700 hover:underline"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="ml-2 text-xs text-ink-500 hover:underline"
            >
              {t("নতুন অর্ডার", "New order")}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ─── Left column: Customer + Address + Products ─── */}
        <div className="space-y-4 lg:col-span-2">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t("গ্রাহক", "Customer")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label={t("ফোন নম্বর", "Phone number")} required>
                <div className="flex gap-2">
                  <Input
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setPhoneTouched(true);
                    }}
                    placeholder="01XXXXXXXXX"
                    inputMode="numeric"
                  />
                  {lookupFetching && (
                    <Loader2 className="h-5 w-5 animate-spin self-center text-ink-400" />
                  )}
                </div>
                {phoneTouched && phone && !phoneValid && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-danger-700">
                    <AlertCircle className="h-3 w-3" />
                    {t("সঠিক ১১-সংখ্যার ফোন দিন", "Enter a valid 11-digit phone")}
                  </p>
                )}
              </Field>

              {customer ? (
                <div className="rounded-md border border-info-200 bg-info-50 p-3 text-sm dark:bg-info-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-info-700">{customer.name}</div>
                      <div className="text-xs text-ink-500">
                        <Phone className="mr-1 inline h-3 w-3" />
                        {customer.phone}
                        {customer.email ? ` · ${customer.email}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-ink-500">
                        {customer._count?.orders ?? 0} {t("অর্ডার", "orders")} ·{" "}
                        {customer._count?.addresses ?? 0} {t("ঠিকানা", "addresses")}
                        {customer.referralCode ? ` · ${customer.referralCode}` : ""}
                      </div>
                    </div>
                    <Badge variant="info">{t("নিবন্ধিত গ্রাহক", "Registered")}</Badge>
                  </div>
                </div>
              ) : phoneValid && !lookupFetching && lookupData === null ? (
                <>
                  <div className="rounded-md border border-warning-300 bg-warning-50 p-2 text-xs text-warning-700 dark:bg-warning-100">
                    {t(
                      "এই ফোনে কোনো নিবন্ধিত গ্রাহক নেই। অর্ডারটি গেস্ট হিসেবে সেভ হবে।",
                      "No registered customer with this phone. Order will be saved as guest.",
                    )}
                  </div>
                  <Field label={t("গ্রাহকের নাম", "Customer name")} required>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={t("নাম লিখুন", "Enter name")}
                    />
                  </Field>
                  <Field label={t("ইমেইল (ঐচ্ছিক)", "Email (optional)")}>
                    <Input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </Field>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle>{t("ডেলিভারি ঠিকানা", "Delivery Address")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("এলাকা / থানা", "Area / Thana")} required>
                  <Input
                    value={addressArea}
                    onChange={(e) => setAddressArea(e.target.value)}
                    placeholder={t("যেমন: মুড়াফরগঞ্জ", "e.g. Mudafarganj")}
                  />
                </Field>
                <Field label={t("ল্যান্ডমার্ক (ঐচ্ছিক)", "Landmark (optional)")}>
                  <Input
                    value={addressLandmark}
                    onChange={(e) => setAddressLandmark(e.target.value)}
                    placeholder={t("যেমন: মসজিদের পাশে", "e.g. Beside the mosque")}
                  />
                </Field>
              </div>
              <Field label={t("সম্পূর্ণ ঠিকানা", "Full address")} required>
                <textarea
                  value={addressFullText}
                  onChange={(e) => setAddressFullText(e.target.value)}
                  rows={2}
                  placeholder={t("বাড়ি, রোড, এলাকা...", "House, road, area...")}
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("অক্ষাংশ (ঐচ্ছিক)", "Latitude (optional)")}>
                  <Input
                    type="number"
                    step="any"
                    value={addressLat}
                    onChange={(e) => setAddressLat(e.target.value)}
                    placeholder="23.7853"
                  />
                </Field>
                <Field label={t("দ্রাঘিমাংশ (ঐচ্ছিক)", "Longitude (optional)")}>
                  <Input
                    type="number"
                    step="any"
                    value={addressLng}
                    onChange={(e) => setAddressLng(e.target.value)}
                    placeholder="91.1153"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                {t("পণ্য যোগ করুন", "Add Products")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder={t("পণ্য খুঁজুন... (নাম বা SKU)", "Search products... (name or SKU)")}
                autoFocus
              />
              {debouncedProductSearch && (
                <div className="max-h-72 overflow-y-auto rounded-md border border-ink-200 dark:border-ink-300">
                  {productQuery.isFetching ? (
                    <div className="p-4 text-center text-sm text-ink-500">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </div>
                  ) : productResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-ink-500">
                      {t("কোনো পণ্য পাওয়া যায়নি", "No products found")}
                    </div>
                  ) : (
                    <ul className="divide-y divide-ink-200 dark:divide-ink-300">
                      {productResults.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-3 p-2 hover:bg-ink-50 dark:hover:bg-ink-100"
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-ink-100 dark:bg-ink-200">
                            {p.image ? (
                              <img
                                src={p.image}
                                alt={p.nameEn}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-lg">
                                📦
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{p.nameEn}</div>
                            <div className="truncate text-xs text-ink-500">{p.nameBn}</div>
                            <div className="mt-0.5 text-xs">
                              <span className="font-bold text-ink-900 dark:text-ink-900">
                                {formatBDT(p.salePrice)}
                              </span>
                              {p.mrp && p.mrp > p.salePrice && (
                                <span className="ml-1 text-ink-400 line-through">
                                  {formatBDT(p.mrp)}
                                </span>
                              )}
                              <span
                                className={`ml-2 ${
                                  p.stockQty === 0
                                    ? "text-danger-700"
                                    : p.stockQty < 10
                                    ? "text-warning-700"
                                    : "text-ink-500"
                                }`}
                              >
                                {p.stockQty === 0
                                  ? t("স্টক নেই", "Out of stock")
                                  : `${p.stockQty} ${p.unit ?? "pc"}`}
                              </span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={p.stockQty === 0}
                            onClick={() => addToCart(p)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t("কার্ট", "Cart")}</span>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-xs font-normal text-danger-700 hover:underline"
                  >
                    {t("সব মুছুন", "Clear all")}
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <div className="py-6 text-center text-sm text-ink-500">
                  {t("কার্ট খালি — উপরে পণ্য যোগ করুন", "Cart is empty — add products above")}
                </div>
              ) : (
                <ul className="divide-y divide-ink-200 dark:divide-ink-300">
                  {cart.map((l) => (
                    <li key={l.productId} className="flex items-center gap-3 py-2">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-ink-100 dark:bg-ink-200">
                        {l.image ? (
                          <img src={l.image} alt={l.nameEn} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-base">
                            📦
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{l.nameEn}</div>
                        <div className="text-xs text-ink-500">
                          {formatBDT(l.unitPrice)} × {l.qty} = {formatBDT(l.unitPrice * l.qty)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => updateQty(l.productId, -1)}
                          disabled={l.qty <= 1}
                          className="h-7 w-7"
                        >
                          −
                        </Button>
                        <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => updateQty(l.productId, +1)}
                          disabled={l.qty >= l.stockQty}
                          className="h-7 w-7"
                        >
                          +
                        </Button>
                        <button
                          type="button"
                          onClick={() => removeLine(l.productId)}
                          className="ml-2 text-danger-700 hover:text-danger-800"
                          title={t("মুছুন", "Remove")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Right column: Pricing + Payment + Place order ─── */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("মূল্য বিবরণী", "Pricing")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label={t("সাবটোটাল (গণনা করা)", "Subtotal (calculated)")}>
                <div className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm font-semibold dark:border-ink-300 dark:bg-ink-100">
                  {formatBDT(itemSubtotal)}
                </div>
              </Field>
              <Field
                label={t("ছাড় (৳)", "Discount (BDT)")}
                hint={t("ক্যাশিয়ার-প্রদত্ত ছাড়", "Cashier-applied discount")}
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discountTotal}
                  onChange={(e) => setDiscountTotal(e.target.value)}
                />
              </Field>
              <Field
                label={t("ডেলিভারি ফি (৳)", "Delivery Fee (BDT)")}
                hint={t(
                  "POS-এ স্বয়ংক্রিয় গণনা হয় না; ক্যাশিয়ার লিখুন",
                  "No auto-calc in POS; cashier enters",
                )}
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                />
              </Field>
              <div className="rounded-md border-2 border-primary-700 bg-primary-50 p-3 dark:bg-primary-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary-700">
                    {t("সর্বমোট", "Grand Total")}
                  </span>
                  <span className="text-xl font-bold text-primary-700">
                    {formatBDT(grandTotal)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("পেমেন্ট পদ্ধতি", "Payment Method")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <label
                    key={m.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 transition-colors ${
                      paymentMethod === m.value
                        ? "border-primary-700 bg-primary-50 dark:bg-primary-100"
                        : "border-ink-200 hover:bg-ink-50 dark:border-ink-300 dark:hover:bg-ink-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={m.value}
                      checked={paymentMethod === m.value}
                      onChange={() => setPaymentMethod(m.value)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{t(m.bn, m.en)}</div>
                      <div className="text-xs text-ink-500">{t(m.hint.bn, m.hint.en)}</div>
                    </div>
                  </label>
                ))}
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-200 p-2 dark:border-ink-300">
                <input
                  type="checkbox"
                  checked={markAsPaid}
                  onChange={(e) => setMarkAsPaid(e.target.checked)}
                />
                <span className="text-sm">
                  {t("পেমেন্ট ইতিমধ্যে গৃহীত হিসেবে চিহ্নিত করুন", "Mark payment as already received")}
                </span>
              </label>

              <Field label={t("নোট (ঐচ্ছিক)", "Notes (optional)")}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t(
                    "যেমন: গ্রাহক ১৫ মিনিটে আসবে",
                    "e.g. Customer arriving in 15 min",
                  )}
                  className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-300 dark:bg-ink-50 dark:text-ink-900"
                />
              </Field>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            disabled={!canPlace || place.isPending}
            onClick={openConfirm}
          >
            {place.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="mr-1 h-4 w-4" />
            )}
            {t("অর্ডার দিন", "Place Order")} · {formatBDT(grandTotal)}
          </Button>

          {!canPlace && (
            <p className="text-center text-xs text-ink-500">
              {t(
                "কার্টে পণ্য, ঠিকানা ও গ্রাহকের নাম/ফোন দিন",
                "Add items, address, and customer phone/name",
              )}
            </p>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      <Modal
        open={confirmOpen}
        onClose={() => (place.isPending ? null : setConfirmOpen(false))}
        title={t("অর্ডার নিশ্চিত করুন", "Confirm Order")}
      >
        <div className="space-y-3 text-sm">
          <Row
            label={t("গ্রাহক", "Customer")}
            value={
              customer
                ? `${customer.name} (${customer.phone})`
                : `${customerName} (${phone}) — ${t("গেস্ট", "guest")}`
            }
          />
          <Row
            label={t("ঠিকানা", "Address")}
            value={`${addressArea}${addressLandmark ? `, ${addressLandmark}` : ""} — ${addressFullText}`}
          />
          <Row label={t("আইটেম সংখ্যা", "Items")} value={`${cart.length} (${cart.reduce((s, l) => s + l.qty, 0)} pcs)`} />
          <Row
            label={t("সাবটোটাল", "Subtotal")}
            value={formatBDT(itemSubtotal)}
          />
          {discount > 0 && (
            <Row label={t("ছাড়", "Discount")} value={`− ${formatBDT(discount)}`} />
          )}
          {fee > 0 && (
            <Row label={t("ডেলিভারি", "Delivery")} value={`+ ${formatBDT(fee)}`} />
          )}
          <div className="border-t pt-2 dark:border-ink-300">
            <Row
              label={t("সর্বমোট", "Grand Total")}
              value={formatBDT(grandTotal)}
              bold
            />
          </div>
          <Row
            label={t("পেমেন্ট", "Payment")}
            value={`${paymentMethod}${markAsPaid ? " ✓" : ""}`}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setConfirmOpen(false)}
            disabled={place.isPending}
          >
            {t("বাতিল", "Cancel")}
          </Button>
          <Button onClick={() => place.mutate()} disabled={place.isPending}>
            {place.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("নিশ্চিত করুন ও অর্ডার দিন", "Confirm & Place Order")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-700 dark:text-ink-900">
        {label}
        {required && <span className="ml-0.5 text-danger-700">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-500">{label}</span>
      <span className={bold ? "font-bold text-ink-900 dark:text-ink-900" : "text-ink-700 dark:text-ink-900"}>
        {value}
      </span>
    </div>
  );
}
