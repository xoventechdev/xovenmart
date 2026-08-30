"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ArrowRight,
  ShoppingBag,
  MapPin,
  Phone,
  User,
  Home,
  CreditCard,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { useCart } from "@/lib/cart";
import { useLocationStore } from "@/lib/use-location";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { SavedAddressPicker } from "@/components/checkout/saved-address-picker";
import { toast } from "sonner";
import type { DeliveryLocation } from "@/lib/location";

// Leaflet-based map picker — must not run on the server.
const LocationStep = dynamic(
  () => import("@/components/map/location-step").then((m) => m.LocationStep),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
    ),
  },
);

interface DeliveryCalc {
  zoneId: string | null;
  zoneNameBn?: string;
  zoneNameEn?: string;
  deliveryFee: number;
  freeAbove?: number | null;
  freeDeliveryApplied?: boolean;
  outsideAllZones?: boolean;
  distanceKm?: number;
  weightKg?: number;
  baseKm?: number;
  baseFee?: number;
  perKmFee?: number;
  perKgFee?: number;
  heavyKgThreshold?: number | null;
  heavyKgFee?: number | null;
  breakdown?: {
    distanceFee: number;
    weightFee: number;
    extraKm: number;
  };
  message?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

function itemName(item: any, lang: "bn" | "en"): string {
  if (lang === "en") return item.nameEn || item.nameBn || "";
  return item.nameBn || item.nameEn || "";
}

export function CheckoutView() {
  const router = useRouterSafe();
  const cart = useCart();
  const { lang } = useTheme();
  const tw = useTwin();
  const auth = useAuth();
  const deliveryPublic = useDeliveryPublicSafe();
  const items = cart.items;
  const subtotal = useMemo(() => cart.subtotal(), [items, cart]);

  // Persisted location — survive page refreshes / cart navigation
  const persistedLocation = useLocationStore((s) => s.location);
  const setPersistedLocation = useLocationStore((s) => s.setLocation);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [landmark, setLandmark] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "BKASH" | "NAGAD">(
    "COD"
  );
  const [couponCode, setCouponCode] = useState("");

  // Async state
  const [deliveryCalc, setDeliveryCalc] = useState<DeliveryCalc | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrderNo, setSuccessOrderNo] = useState<string | null>(null);

  // Auto-fill name + phone from the authenticated user. Only runs when
  // the user switches (auth.user.id changes) and only writes to fields
  // the user hasn't manually touched — preserves any edits they made
  // before logging in.
  useEffect(() => {
    if (!auth.user) return;
    setName((prev) => (prev.trim() ? prev : auth.user!.name ?? ""));
    setPhone((prev) => (prev.trim() ? prev : auth.user!.phone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  // Compute delivery fee whenever subtotal or location changes
  useEffect(() => {
    if (!items.length || subtotal <= 0) return;
    if (!persistedLocation) return;
    setDeliveryLoading(true);
    // Send EVERY line to the backend for weight calc — including items
    // without a weightGrams value. Backend will default missing weights to
    // 1000g so the fee reflects the real cart size, not just the items
    // that happen to have a weight filled in.
    const weightItems = items.map((i) => ({
      qty: i.qty,
      weightGrams: i.weightGrams && i.weightGrams > 0 ? i.weightGrams : undefined,
    }));
    const params = new URLSearchParams({
      lat: String(persistedLocation.lat),
      lng: String(persistedLocation.lng),
      subtotal: String(subtotal),
    });
    if (weightItems.length > 0) {
      params.set("items", JSON.stringify(weightItems));
    }
    const url = `${API}/catalog/delivery-fee?${params.toString()}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDeliveryCalc(d ?? null))
      .catch(() => setDeliveryCalc(null))
      .finally(() => setDeliveryLoading(false));
  }, [subtotal, persistedLocation?.lat, persistedLocation?.lng, items]);

  if (!items.length && !successOrderNo) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <ShoppingBag className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          {tw("আপনার কার্ট খালি", "Your cart is empty")}
        </h2>
        <p className="text-muted-foreground mb-6">
          {tw(
            "চেকআউট করতে কার্টে পণ্য যোগ করুন।",
            "Add items to your cart to check out.",
          )}
        </p>
        <Button asChild size="lg">
          <Link href="/">
            {tw("কেনাকাটা শুরু করুন", "Start shopping")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  if (successOrderNo) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto mb-4 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {tw("অর্ডার সফল হয়েছে!", "Order placed successfully!")}
        </h2>
        <p className="text-muted-foreground mb-1">
          {tw("আপনার অর্ডার নম্বর", "Your order number")}
        </p>
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="text-xl font-bold text-primary font-mono">{successOrderNo}</span>
          <CopyButton value={successOrderNo} size="lg" />
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {tw(
            "শীঘ্রই আমাদের একজন প্রতিনিধি যোগাযোগ করবেন। অর্ডার ট্র্যাক পেজ থেকে স্ট্যাটাস দেখুন।",
            "One of our reps will contact you shortly. Track status on the order tracking page.",
          )}
        </p>
        <div className="flex gap-2 justify-center">
          <Button asChild>
            <Link href={`/track?orderNo=${successOrderNo}&phone=${encodeURIComponent(phone.trim())}`}>
              {tw("অর্ডার ট্র্যাক করুন", "Track order")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              {tw("শপিং চালিয়ে যান", "Continue shopping")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const deliveryFee = deliveryCalc?.deliveryFee ?? 0;
  const grandTotal = subtotal + deliveryFee;

  const validateBDPhone = (p: string) =>
    /^(\+?88)?01[3-9]\d{8}$/.test(p.replace(/\s/g, ""));

  const placeOrder = async () => {
    setError(null);

    // Guest-checkout gate: when the admin disables guest checkout,
    // unauthenticated users must log in (or register) before placing
    // an order. Authenticated users are always allowed through.
    if (
      deliveryPublic.guestCheckoutEnabled === false &&
      !auth.isAuthenticated
    ) {
      toast.info(
        tw(
          "অর্ডার করতে লগইন বা রেজিস্ট্রেশন করুন",
          "Please log in or register to place an order",
        ),
      );
      window.location.href = `/login?next=${encodeURIComponent("/checkout")}`;
      return;
    }

    if (!name.trim())
      return setError(tw("আপনার নাম দিন", "Please enter your name"));
    if (!validateBDPhone(phone))
      return setError(
        tw(
          "সঠিক মোবাইল নম্বর দিন (যেমন: 01710000000)",
          "Enter a valid mobile number (e.g. 01710000000)",
        ),
      );
    if (!persistedLocation)
      return setError(
        tw(
          "ডেলিভারি লোকেশন নির্বাচন করুন (ম্যাপ পিন বা ঠিকানা লিখুন)",
          "Select a delivery location (drop a map pin or type an address)",
        ),
      );
    if (persistedLocation.fullText.trim().length < 5)
      return setError(
        tw(
          "ঠিকানা খুব ছোট — ম্যাপে পিন টানুন বা পুরো ঠিকানা লিখুন",
          "Address is too short — drop a map pin or type the full address",
        ),
      );

    setPlacing(true);
    try {
      const payload = {
        guestName: name.trim(),
        guestPhone: phone.trim(),
        address: {
          label: "Home",
          area: persistedLocation.area || persistedLocation.city || "Unknown",
          line1: persistedLocation.line1 || undefined,
          city: persistedLocation.city || undefined,
          postcode: persistedLocation.postcode || undefined,
          landmark: landmark.trim() || undefined,
          fullText: persistedLocation.fullText,
          lat: persistedLocation.lat,
          lng: persistedLocation.lng,
        },
        items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        couponCode: couponCode.trim() || undefined,
        paymentMethod,
        notes: notes.trim() || undefined,
      };

      const res = await fetch(`${API}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.message?.toString?.() ||
          (Array.isArray(data?.message)
            ? data.message.join(", ")
            : null) ||
          data?.error ||
          (lang === "en" ? `Order failed (${res.status})` : `অর্ডার ব্যর্থ (${res.status})`);
        throw new Error(msg);
      }

      const orderNo = data.orderNo || data.order?.orderNo;
      if (!orderNo)
        throw new Error(
          lang === "en" ? "Order number missing in response" : "অর্ডার নম্বর পাওয়া যায়নি",
        );
      setSuccessOrderNo(orderNo);
      cart.clear();
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    } catch (e: any) {
      setError(
        e.message ||
          (lang === "en" ? "Could not place order" : "অর্ডার করতে সমস্যা হয়েছে"),
      );
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">{tw("চেকআউট", "Checkout")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {tw(
          "আপনার ডেলিভারি তথ্য দিয়ে অর্ডার সম্পন্ন করুন",
          "Complete your order with your delivery details",
        )}
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer info */}
          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-5">
            <h2 className="font-bold mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {tw("আপনার তথ্য", "Your details")}
            </h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  {tw("নাম *", "Name *")}
                </label>
                <Input
                  placeholder={tw("আপনার নাম", "Your name")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  {tw("মোবাইল নম্বর *", "Mobile number *")}
                </label>
                <Input
                  placeholder="01XXXXXXXXX"
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Address — Map + Type picker */}
          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-5">
            <h2 className="font-bold mb-1 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {tw("ডেলিভারি লোকেশন", "Delivery location")}
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              {tw(
                "ম্যাপে পিন টানুন, GPS শেয়ার করুন, অথবা ঠিকানা লিখুন — যেকোনো একটি ডেলিভারির জন্য যথেষ্ট।",
                "Drop a pin on the map, share your GPS, or type an address — any one is enough.",
              )}
            </p>
            {auth.isAuthenticated && <SavedAddressPicker />}
            <LocationStep
              value={persistedLocation}
              onChange={(loc) => setPersistedLocation(loc)}
            />
            <div className="mt-3">
              <label className="text-sm font-medium mb-1 block">
                {tw("ল্যান্ডমার্ক (ঐচ্ছিক)", "Landmark (optional)")}
              </label>
              <Input
                placeholder={tw("যেমন: পুরাতন স্কুলের পাশে", "e.g. next to the old school")}
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
              />
            </div>
          </section>

          {/* Payment */}
          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-5">
            <h2 className="font-bold mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              {tw("পেমেন্ট পদ্ধতি", "Payment method")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PaymentOption
                value="COD"
                label={tw("ক্যাশ অন ডেলিভারি", "Cash on Delivery")}
                sub={tw("পণ্য পেয়ে টাকা দিন", "Pay when you receive")}
                icon={<Home className="h-5 w-5" />}
                selected={paymentMethod === "COD"}
                onSelect={() => setPaymentMethod("COD")}
                enabled
              />
              <PaymentOption
                value="BKASH"
                label="bKash"
                sub={tw("শীঘ্রই আসছে", "Coming soon")}
                icon={<Phone className="h-5 w-5" />}
                selected={paymentMethod === "BKASH"}
                onSelect={() => setPaymentMethod("BKASH")}
                enabled={false}
              />
              <PaymentOption
                value="NAGAD"
                label="Nagad"
                sub={tw("শীঘ্রই আসছে", "Coming soon")}
                icon={<Phone className="h-5 w-5" />}
                selected={paymentMethod === "NAGAD"}
                onSelect={() => setPaymentMethod("NAGAD")}
                enabled={false}
              />
            </div>
            {paymentMethod !== "COD" && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                {tw(
                  "⚠️ এই পদ্ধতি এখনো সক্রিয় নয়। অনুগ্রহ করে ক্যাশ অন ডেলিভারি নির্বাচন করুন।",
                  "⚠️ This method is not active yet. Please choose Cash on Delivery.",
                )}
              </p>
            )}
          </section>

          {/* Notes + coupon */}
          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-5">
            <h2 className="font-bold mb-4">
              {tw("অতিরিক্ত তথ্য", "Additional info")}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  {tw("কুপন কোড (ঐচ্ছিক)", "Coupon code (optional)")}
                </label>
                <Input
                  placeholder={tw("যেমন: WELCOME10", "e.g. WELCOME10")}
                  value={couponCode}
                  onChange={(e) =>
                    setCouponCode(e.target.value.toUpperCase())
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">
                  {tw("নোট (ঐচ্ছিক)", "Notes (optional)")}
                </label>
                <textarea
                  rows={2}
                  placeholder={tw(
                    "বিশেষ কোনো নির্দেশনা...",
                    "Any special instructions...",
                  )}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-100 dark:text-ink-900 dark:placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-5 sticky top-32 space-y-4">
            <h2 className="font-bold text-lg">
              {tw("অর্ডার সারাংশ", "Order summary")}
            </h2>

            {/* Items */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {items.map((it) => (
                <div key={it.productId} className="flex gap-2 text-sm">
                  <div className="relative w-12 h-12 rounded-md overflow-hidden bg-ink-50 dark:bg-ink-800 flex-shrink-0">
                    {it.image && (
                      <Image
                        src={it.image}
                        alt={itemName(it, lang)}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="line-clamp-2 font-medium text-xs">
                      {itemName(it, lang)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {it.qty} × ৳{it.unitPrice.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    ৳{(it.unitPrice * it.qty).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-ink-200 dark:border-ink-800 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {tw("সাবটোটাল", "Subtotal")}
                </span>
                <span>৳{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {tw("ডেলিভারি ফি", "Delivery fee")}
                </span>
                {deliveryLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : deliveryCalc?.freeDeliveryApplied ? (
                  <span className="text-green-600 font-semibold">
                    {tw("ফ্রি ✨", "Free ✨")}
                  </span>
                ) : deliveryCalc?.outsideAllZones ? (
                  <span className="text-xs text-amber-600">
                    {tw("এলাকার বাইরে", "Outside area")}
                  </span>
                ) : (
                  <span>৳{deliveryFee.toLocaleString("en-IN")}</span>
                )}
              </div>

              {/* Distance + weight breakdown */}
              {!deliveryLoading &&
                deliveryCalc &&
                !deliveryCalc.outsideAllZones &&
                deliveryCalc.breakdown && (
                  <div className="rounded-md bg-ink-50 dark:bg-ink-800 px-2 py-1.5 text-[11px] text-muted-foreground space-y-1">
                    {deliveryCalc.zoneNameBn && (
                      <div className="flex justify-between">
                        <span>{tw("জোন:", "Zone:")}</span>
                        <span className="font-medium text-ink-700 dark:text-ink-200">
                          {lang === "en"
                            ? deliveryCalc.zoneNameEn || deliveryCalc.zoneNameBn
                            : deliveryCalc.zoneNameBn}
                        </span>
                      </div>
                    )}
                    {typeof deliveryCalc.distanceKm === "number" && (
                      <div className="flex justify-between">
                        <span>{tw("দূরত্ব:", "Distance:")}</span>
                        <span className="font-medium text-ink-700 dark:text-ink-200">
                          {deliveryCalc.distanceKm.toFixed(2)} km
                          {deliveryCalc.breakdown.extraKm > 0
                            ? ` (+${deliveryCalc.breakdown.extraKm}km × ৳${deliveryCalc.perKmFee ?? 0})`
                            : ""}
                        </span>
                      </div>
                    )}
                    {typeof deliveryCalc.weightKg === "number" &&
                      deliveryCalc.weightKg > 0 && (
                        <div className="flex justify-between">
                          <span>{tw("ওজন:", "Weight:")}</span>
                          <span className="font-medium text-ink-700 dark:text-ink-200">
                            {deliveryCalc.weightKg.toFixed(2)} kg
                            {(deliveryCalc.perKgFee ?? 0) > 0
                              ? ` × ৳${deliveryCalc.perKgFee}/kg`
                              : ""}
                          </span>
                        </div>
                      )}

                    {/* Heavy-cart surcharge callout (flat fee kicks in) */}
                    {typeof deliveryCalc.weightKg === "number" &&
                      typeof deliveryCalc.heavyKgThreshold === "number" &&
                      typeof deliveryCalc.heavyKgFee === "number" &&
                      deliveryCalc.weightKg > deliveryCalc.heavyKgThreshold && (
                        <div className="flex items-start gap-1.5 rounded bg-amber-100 dark:bg-amber-500/20 px-1.5 py-1 text-[10px] text-amber-800 dark:text-amber-200">
                          <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                          <span>
                            {tw(
                              `ভারী অর্ডার (${deliveryCalc.heavyKgThreshold} kg এর বেশি) — প্রতি কেজির বদলে ফ্ল্যাট ৳${deliveryCalc.heavyKgFee} চার্জ`,
                              `Heavy order (>${deliveryCalc.heavyKgThreshold} kg) — flat ৳${deliveryCalc.heavyKgFee} instead of per-kg`,
                            )}
                          </span>
                        </div>
                      )}

                    {/* Per-kg surcharge warning when not overridden by heavy threshold */}
                    {(deliveryCalc.perKgFee ?? 0) > 0 &&
                      typeof deliveryCalc.weightKg === "number" &&
                      deliveryCalc.weightKg > 0 &&
                      (typeof deliveryCalc.heavyKgThreshold !== "number" ||
                        deliveryCalc.weightKg <= deliveryCalc.heavyKgThreshold) && (
                        <div className="flex items-start gap-1.5 rounded bg-amber-100 dark:bg-amber-500/20 px-1.5 py-1 text-[10px] text-amber-800 dark:text-amber-200">
                          <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                          <span>
                            {tw(
                              `প্রতি কেজিতে ৳${deliveryCalc.perKgFee} ওজন চার্জ (আপনার কার্ট: ${deliveryCalc.weightKg.toFixed(2)} kg → ৳${deliveryCalc.breakdown.weightFee})`,
                              `৳${deliveryCalc.perKgFee}/kg weight surcharge (your cart: ${deliveryCalc.weightKg.toFixed(2)} kg → ৳${deliveryCalc.breakdown.weightFee})`,
                            )}
                          </span>
                        </div>
                      )}

                    {deliveryCalc.freeDeliveryApplied && (
                      <div className="text-green-600 dark:text-green-400">
                        ✨ {tw(
                          `ফ্রি ডেলিভারি (≥ ৳${deliveryCalc.freeAbove})`,
                          `Free delivery (≥ ৳${deliveryCalc.freeAbove})`,
                        )}
                      </div>
                    )}
                  </div>
                )}

              {/* Outside all zones — soft block */}
              {deliveryCalc?.outsideAllZones && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                  {deliveryCalc.message ||
                    (lang === "en"
                      ? "Delivery not available in this area"
                      : "এই এলাকায় ডেলিভারি সম্ভব নয়")}
                  {typeof deliveryCalc.distanceKm === "number" && (
                    <div className="mt-0.5 text-[10px]">
                      {tw(
                        `নিকটতম জোন থেকে দূরত্ব: ${deliveryCalc.distanceKm.toFixed(2)} km`,
                        `Distance to nearest zone: ${deliveryCalc.distanceKm.toFixed(2)} km`,
                      )}
                    </div>
                  )}
                </div>
              )}

              {deliveryCalc?.freeAbove && !deliveryCalc.freeDeliveryApplied && (
                <FreeDeliveryProgress
                  subtotal={subtotal}
                  freeAbove={deliveryCalc.freeAbove}
                  tw={tw}
                />
              )}
              <div className="border-t border-ink-200 dark:border-ink-800 pt-2 flex justify-between font-bold text-base">
                <span>{tw("মোট", "Total")}</span>
                <span className="text-primary">
                  ৳{grandTotal.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button
              onClick={placeOrder}
              disabled={
                placing ||
                paymentMethod !== "COD" ||
                !persistedLocation ||
                deliveryLoading ||
                deliveryCalc?.outsideAllZones === true
              }
              className="w-full"
              size="lg"
            >
              {placing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tw("অর্ডার হচ্ছে...", "Placing order...")}
                </>
              ) : deliveryCalc?.outsideAllZones ? (
                <>{tw("এই এলাকায় ডেলিভারি সম্ভব নয়", "Delivery not available here")}</>
              ) : !persistedLocation ? (
                <>{tw("ম্যাপে পিন দিন বা ঠিকানা লিখুন", "Drop a pin or type an address")}</>
              ) : deliveryLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tw("ফি হিসাব হচ্ছে...", "Calculating fee...")}
                </>
              ) : (
                <>
                  {tw("অর্ডার নিশ্চিত করুন", "Confirm order")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              {tw("অর্ডার করার মাধ্যমে আপনি আমাদের ", "By placing your order you accept our ")}
              <Link
                href="/legal/terms"
                className="text-primary hover:underline"
              >
                {tw("শর্তাবলী", "Terms")}
              </Link>{" "}
              {tw("মেনে নিচ্ছেন", "of service")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "৳X more for free delivery" hint with a slim progress bar.
 * Replaces the plain tip line so the user can see exactly how close they
 * are to the free-delivery threshold (motivates them to add another item).
 */
function FreeDeliveryProgress({
  subtotal,
  freeAbove,
  tw,
}: {
  subtotal: number;
  freeAbove: number;
  tw: (bn: string, en: string) => string;
}) {
  const remaining = Math.max(0, freeAbove - subtotal);
  const pct = Math.min(100, Math.round((subtotal / freeAbove) * 100));
  const atZero = remaining <= 0;
  return (
    <div className="space-y-1 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-2 py-1.5">
      <div className="flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-200">
        <span className="inline-flex items-center gap-1">
          💡{" "}
          {atZero
            ? tw("ফ্রি ডেলিভারি!", "Free delivery!")
            : tw(
                `আরো ৳${Math.ceil(remaining).toLocaleString("en-IN")} যোগ করলে ফ্রি ডেলিভারি`,
                `Add ৳${Math.ceil(remaining).toLocaleString("en-IN")} more for free delivery`,
              )}
        </span>
        <span className="font-mono text-[10px]">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/60 dark:bg-emerald-900/50">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PaymentOption({
  value,
  label,
  sub,
  icon,
  selected,
  onSelect,
  enabled,
}: {
  value: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  enabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={enabled ? onSelect : undefined}
      disabled={!enabled}
      className={`text-left p-3 rounded-lg border-2 transition-all ${
        selected
          ? "border-primary bg-primary/5"
          : "border-ink-200 dark:border-ink-800 hover:border-primary/50"
      } ${!enabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <div className="font-semibold text-sm">{label}</div>
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  );
}

// Imported lazily via dynamic so it doesn't pull in next/router for nothing
// (and so `router` stays optional in some test paths). Safe wrapper:
import { useRouter as _useRouter } from "next/navigation";
function useRouterSafe() {
  try {
    return _useRouter();
  } catch {
    return { push: () => {} } as any;
  }
}