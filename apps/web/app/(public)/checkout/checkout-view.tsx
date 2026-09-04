"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
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
  Info,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { useCart } from "@/lib/cart";
import { useLocationStore, pickSavedLocation } from "@/lib/use-location";
import { useTheme } from "@/lib/theme";
import { useTwin } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useDeliveryPublicSafe } from "@/lib/use-delivery-public";
import { useFeatureToggles } from "@/lib/use-feature-toggles";
import { SavedAddressStep } from "@/components/checkout/saved-address-step";
import { toast } from "sonner";

// Leaflet is window-dependent — dynamic-import the map step. Only mount
// it on the client (also reused by the guest flow below).
const LocationStep = dynamic(
  () => import("@/components/map/location-step").then((m) => m.LocationStep),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />
    ),
  },
);
import {
  ApiError,
  api as apiClient,
} from "@/lib/api";
import {
  CustomerAddress,
  createAddress,
  invalidateAddressCaches,
  useAddresses,
} from "@/lib/addresses";
import { useQueryClient } from "@tanstack/react-query";
import type { DeliveryLocation } from "@/lib/location";

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

/**
 * Map a stable coupon-error discriminator returned by
 * `GET /coupons/:code` to a user-facing string in the active language.
 * The controller emits one of:
 *   - NOT_FOUND         — no such code
 *   - INACTIVE          — disabled by admin
 *   - NOT_STARTED       — startsAt in the future
 *   - EXPIRED           — endsAt in the past
 *   - LIMIT_REACHED     — global usageLimit hit
 *   - ALREADY_REDEEMED  — this user already used the code
 *   - WRONG_USER        — coupon restricted to a different account
 * Without this mapping the user would either see the raw English
 * message from the API or a generic "invalid" toast even when the
 * coupon is real but already spent.
 */
function mapCouponError(
  code: string | undefined,
  fallback: string | undefined,
  lang: "bn" | "en",
): string {
  const bn: Record<string, string> = {
    NOT_FOUND: "এই কুপন কোডটি সচল নয়",
    INACTIVE: "এই কুপনটি এখন সক্রিয় নয়",
    NOT_STARTED: "এই কুপনটি এখনো চালু হয়নি",
    EXPIRED: "এই কুপনের মেয়াদ শেষ",
    LIMIT_REACHED: "এই কুপনের ব্যবহার সীমা শেষ",
    ALREADY_REDEEMED: "আপনি ইতিমধ্যে এই কুপনটি ব্যবহার করেছেন",
    WRONG_USER: "এই কুপনটি আপনার অ্যাকাউন্টের জন্য প্রযোজ্য নয়",
  };
  const en: Record<string, string> = {
    NOT_FOUND: "This coupon code is invalid",
    INACTIVE: "This coupon is not currently active",
    NOT_STARTED: "This coupon is not yet active",
    EXPIRED: "This coupon has expired",
    LIMIT_REACHED: "This coupon's usage limit has been reached",
    ALREADY_REDEEMED: "You have already used this coupon",
    WRONG_USER: "This coupon is not valid for your account",
  };
  const table = lang === "bn" ? bn : en;
  if (code && table[code]) return table[code];
  return (
    fallback ||
    (lang === "bn" ? "এই কুপন কোডটি সচল নয়" : "This coupon code is invalid")
  );
}

const BD_PHONE_RE = /^(\+?88)?01[3-9]\d{8}$/;

/** Approx distance in metres — used to decide whether a manually-picked
 *  pin is "close enough" to a saved address to suppress the save CTA. */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function CheckoutView() {
  const router = useRouterSafe();
  const cart = useCart();
  const { lang } = useTheme();
  const tw = useTwin();
  const auth = useAuth();
  const deliveryPublic = useDeliveryPublicSafe();
  // Feature toggles drive which payment options are selectable. Admin
  // can enable / disable each method at /admin/system/feature-toggles
  // and the public site picks up the change on the next render (cache
  // is invalidated on admin save).
  const featureToggles = useFeatureToggles();
  const items = cart.items;
  const subtotal = useMemo(() => cart.subtotal(), [items, cart]);
  const qc = useQueryClient();

  // Persisted location — survive page refreshes / cart navigation
  const persistedLocation = useLocationStore((s) => s.location);
  const setPersistedLocation = useLocationStore((s) => s.setLocation);
  const pickedAddressId = useLocationStore((s) => s.pickedAddressId);

  // Saved addresses — used to detect "manually picked pin is far from any
  // saved address" so we can show the "Save this address" CTA.
  const { data: addresses } = useAddresses();
  const selectedAddress: CustomerAddress | undefined = useMemo(
    () => addresses?.find((a) => a.id === pickedAddressId),
    [addresses, pickedAddressId],
  );

  /**
   * The single source of truth for what the order is being delivered to.
   *
   * Selection rule:
   *   1. If a saved-address chip is picked → use the saved row's coords.
   *      This MUST override whatever's in the location store — the store
   *      can hold stale manual-pin coords from a previous session
   *      (persisted in localStorage across reloads) and the user's
   *      current intent is the saved address, not the old pin.
   *   2. Otherwise fall back to `persistedLocation` (a fresh map pin,
   *      GPS, or typed address).
   *   3. If neither is available, return null — the user hasn't picked
   *      a delivery source yet.
   *
   * Both the delivery-fee effect AND the order payload derive from this
   * memo so they can't disagree.
   */
  const effectiveLocation: DeliveryLocation | null = useMemo(() => {
    if (selectedAddress && selectedAddress.lat != null && selectedAddress.lng != null) {
      // Build a minimal DeliveryLocation from the saved row. We don't
      // need fullText/area/landmark here — the order payload uses its
      // own fallbacks below, and the fee endpoint only takes lat/lng.
      return {
        lat: Number(selectedAddress.lat),
        lng: Number(selectedAddress.lng),
        fullText: selectedAddress.fullText ?? "",
        line1: "",
        area: selectedAddress.area ?? "",
        city: "",
        source: "map",
      };
    }
    return persistedLocation ?? null;
  }, [selectedAddress, persistedLocation]);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [landmark, setLandmark] = useState("");
  const [notes, setNotes] = useState("");
  // Pick the first *enabled* payment method as the default so the radio
  // is never stuck on a disabled option when admin disables COD, etc.
  const initialPaymentMethod: "COD" | "BKASH" | "NAGAD" =
    featureToggles.enableCOD
      ? "COD"
      : featureToggles.enableBkash
        ? "BKASH"
        : featureToggles.enableNagad
          ? "NAGAD"
          : "COD";
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "BKASH" | "NAGAD">(
    initialPaymentMethod,
  );
  const [couponCode, setCouponCode] = useState("");
  // Applied-coupon state — separate from `couponCode` (the input value)
  // so the user can keep typing in the input without immediately
  // changing the order. Only when the user explicitly clicks "Apply"
  // AND the server confirms the code is valid do we move it into
  // `appliedCoupon` and include it in the order payload. This avoids
  // the previous UX where a typo at checkout time would silently
  // either (a) charge full price (no feedback), or (b) fail in the
  // `placeOrder` request — neither was clear to the customer.
  //
  // `couponError` is a short string explaining why Apply failed; null
  // when nothing is wrong. It clears as soon as the user starts typing
  // again, so they don't see a stale error after fixing their typo.
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    type: "PERCENT" | "FLAT";
    value: number;
    minOrder: number | null;
    maxDiscount: number | null;
    descriptionEn: string | null;
    descriptionBn: string | null;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponError(
        lang === "bn" ? "কুপন কোড দিন" : "Please enter a coupon code",
      );
      return;
    }
    setCouponApplying(true);
    setCouponError(null);
    try {
      // `GET /coupons/:code` returns a discriminated result: on success
      // `ok: true` with coupon fields, on failure `ok: false` with a
      // stable `code` discriminator and a human-readable message.
      // See apps/api/src/modules/coupons/coupons.controller.ts — the
      // controller now checks not-found, inactive, expired, global
      // usage limit, per-user limit, and restrictedUserId mismatch and
      // returns a distinct code for each so the FE can show a precise
      // toast instead of a generic "could not verify" wall.
      const data: any = await apiClient.get(`/coupons/${encodeURIComponent(code)}`);

      // Failure path: discriminated error from the controller.
      if (!data || data.ok === false) {
        setCouponError(mapCouponError(data?.code, data?.message, lang));
        setAppliedCoupon(null);
        return;
      }
      // Belt-and-braces: an unknown payload shape should not "apply" a
      // coupon we can't validate.
      if (!data.code || !data.type) {
        setCouponError(
          lang === "bn"
            ? "এই কুপন কোডটি সঠিক নয়"
            : "This coupon code is invalid",
        );
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({
        code: data.code,
        type: data.type,
        value: Number(data.value) || 0,
        minOrder: data.minOrder ?? null,
        maxDiscount: data.maxDiscount ?? null,
        descriptionEn: data.descriptionEn ?? null,
        descriptionBn: data.descriptionBn ?? null,
      });
      // Clear any stale error and let the user know it worked.
      toast.success(
        lang === "bn"
          ? `কুপন "${data.code}" প্রয়োগ হয়েছে`
          : `Coupon "${data.code}" applied`,
      );
    } catch (e: any) {
      // Network / 5xx — fall back to the API message if any.
      setCouponError(
        e?.data?.message ||
          (lang === "bn"
            ? "কুপন যাচাই করা যায়নি"
            : "Could not verify the coupon"),
      );
      setAppliedCoupon(null);
    } finally {
      setCouponApplying(false);
    }
  }

  // Clear the inline error as soon as the user starts editing again —
  // otherwise the red message lingers after they've corrected the typo.
  function onCouponInputChange(v: string) {
    setCouponCode(v.toUpperCase());
    if (couponError) setCouponError(null);
    // Editing the input after a successful Apply invalidates the
    // confirmation — they could be entering a different code. Drop
    // the applied state so the summary doesn't keep showing a stale
    // discount.
    if (appliedCoupon && v.toUpperCase().trim() !== appliedCoupon.code) {
      setAppliedCoupon(null);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }

  // "Save this address for next time" — only available for logged-in users
  // and only when the current pin is far from every saved row.
  const canOfferSave =
    auth.isAuthenticated &&
    !!persistedLocation &&
    !!persistedLocation.lat &&
    !selectedAddress; // already picked a saved row → no need to "save"
  const pinIsFarFromSaved = useMemo(() => {
    if (!canOfferSave || !persistedLocation) return false;
    const list = addresses ?? [];
    if (list.length === 0) return true;
    return list.every((a) => {
      if (a.lat == null || a.lng == null) return true;
      return (
        haversineMeters(
          persistedLocation.lat,
          persistedLocation.lng,
          a.lat,
          a.lng,
        ) > 50
      );
    });
  }, [canOfferSave, persistedLocation, addresses]);
  const [saveAddressChecked, setSaveAddressChecked] = useState(false);

  // Async state
  const [deliveryCalc, setDeliveryCalc] = useState<DeliveryCalc | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrderNo, setSuccessOrderNo] = useState<string | null>(null);

  // Full-screen gate flag: when admin has disabled guest checkout AND the
  // visitor is not logged in, we short-circuit and render only a login CTA
  // (see the `if (guestBlocked) { ... }` early return below). This replaces
  // the earlier in-form banner — bouncing the guest at submit time was
  // confusing UX, since they had already typed everything in.
  const guestBlocked =
    deliveryPublic.guestCheckoutEnabled === false && !auth.isAuthenticated;

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

  // Guest landed on /checkout (or just logged out while on this page):
  // forget any saved-address pick or manual-pin left over from a
  // previous logged-in session. The Zustand `xm-location` slice is
  // persisted in localStorage, so without this reset a guest could
  // see a highlighted saved-address chip from their previous session
  // (chip doesn't belong to the guest account → backend POST /checkout
  // would either reject or send the wrong coords). Fires on mount and
  // whenever the user transitions authenticated → guest.
  useEffect(() => {
    if (auth.isAuthenticated) return;
    useLocationStore.getState().clearPickedAddressId();
    useLocationStore.getState().setLocation(null);
  }, [auth.isAuthenticated]);

  // Compute delivery fee whenever subtotal or the effective location changes.
  //
  // We depend on `effectiveLocation` (not raw `persistedLocation`) so the
  // fee follows the user's current selection:
  //   - picked saved chip → uses saved row's coords (overrides any stale
  //     manual pin in the store)
  //   - manual pin / GPS / typed → uses the live store coords
  useEffect(() => {
    if (!items.length || subtotal <= 0) return;
    if (!effectiveLocation) return;
    if (!effectiveLocation.lat || !effectiveLocation.lng) return;
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
      lat: String(effectiveLocation.lat),
      lng: String(effectiveLocation.lng),
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
  }, [subtotal, effectiveLocation?.lat, effectiveLocation?.lng, items]);

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

  // When admin has disabled guest checkout and the visitor isn't logged in,
  // show ONLY a login-required CTA — no Contact / Address / Order forms.
  // Replaces the earlier in-form banner so guests can't fill the form and
  // then be bounced at submit time (which was confusing UX).
  if (guestBlocked) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-md rounded-xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-500/40 dark:bg-amber-500/10">
          <Info className="mx-auto mb-3 h-10 w-10 text-amber-600 dark:text-amber-300" />
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100">
            {tw("লগইন প্রয়োজন", "Login required")}
          </h2>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
            {tw(
              "অর্ডার করতে লগইন বা রেজিস্ট্রেশন করুন। অতিথি চেকআউট বর্তমানে বন্ধ আছে।",
              "Please log in or register to place an order. Guest checkout is currently disabled.",
            )}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={`/login?next=${encodeURIComponent("/checkout")}`}>
                {tw("লগইন করুন", "Log in")}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Link
                href={`/register?next=${encodeURIComponent("/checkout")}`}
              >
                {tw("রেজিস্ট্রেশন করুন", "Register")}
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">
            {tw(
              "কার্টের পণ্য সংরক্ষিত আছে — লগইনের পরে একই পেজে ফিরে আসবে।",
              "Your cart is saved — you'll return to this page after logging in.",
            )}
          </p>
        </div>
      </div>
    );
  }

  const validateBDPhone = (p: string) =>
    BD_PHONE_RE.test(p.replace(/\s/g, ""));

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
    if (!effectiveLocation)
      return setError(
        tw(
          "ডেলিভারি লোকেশন নির্বাচন করুন (ম্যাপ পিন বা ঠিকানা লিখুন)",
          "Select a delivery location (drop a map pin or type an address)",
        ),
      );
    if (!effectiveLocation.lat || !effectiveLocation.lng)
      return setError(
        tw(
          "ম্যাপে পিন দিন — সঠিক ডেলিভারি ফি হিসাব করতে হবে",
          "Drop a map pin so we can calculate the delivery fee accurately",
        ),
      );
    if (effectiveLocation.fullText.trim().length < 5)
      return setError(
        tw(
          "ঠিকানা খুব ছোট — ম্যাপে পিন টানুন বা পুরো ঠিকানা লিখুন",
          "Address is too short — drop a map pin or type the full address",
        ),
      );

    setPlacing(true);
    try {
      // Optional: save the pin as a Home address before placing the order.
      // We await this so the order's addressSnapshot can reference the
      // newly-saved row's slot type if needed. If the save fails, we
      // toast a warning and continue with the order anyway.
      let resolvedType: "HOME" | "OFFICE" | "OTHER" = "HOME";
      let resolvedLabel = "Home";
      if (selectedAddress) {
        resolvedType = selectedAddress.type;
        resolvedLabel =
          selectedAddress.label || resolvedType.charAt(0) + resolvedType.slice(1).toLowerCase();
      }
      if (saveAddressChecked && auth.isAuthenticated && pinIsFarFromSaved && persistedLocation) {
        try {
          const saved = await createAddress({
            type: "HOME",
            label: null,
            area:
              persistedLocation.area ||
              persistedLocation.city ||
              persistedLocation.fullText.split(",")[0].trim() ||
              "Saved",
            landmark: landmark.trim() || null,
            fullText: persistedLocation.fullText,
            lat: persistedLocation.lat,
            lng: persistedLocation.lng,
          });
          resolvedType = saved.address.type;
          resolvedLabel = saved.address.label || "Home";
          // Re-link the picker to the newly-saved row so the order tracks
          // the right slot.
          pickSavedLocation(persistedLocation, saved.address.id);
          await invalidateAddressCaches(qc);
        } catch (e) {
          // Save failed (e.g. user already has a Home address). Toast and
          // continue — we still place the order with HOME type.
          if (e instanceof ApiError) {
            toast.warning(
              String(
                e.data?.message?.toString?.() ??
                  e.data?.message ??
                  tw(
                    "ঠিকানা সেভ হয়নি — অর্ডার চালিয়ে যাচ্ছি",
                    "Could not save the address — proceeding with order",
                  ),
              ),
            );
          }
        }
      }

      // Build the order payload from the SAME source as the displayed
      // delivery fee so they can't disagree:
      //   - if a saved chip is picked → use selectedAddress (its own
      //     fullText/area/type/label/lat/lng). This overrides any stale
      //     manual-pin coords in the location store.
      //   - else → use effectiveLocation (the live map pin / GPS).
      const orderSource: {
        type: "HOME" | "OFFICE" | "OTHER";
        label: string;
        fullText: string;
        area: string;
        lat: number;
        lng: number;
      } = selectedAddress
        ? {
            type: resolvedType,
            label: resolvedLabel,
            fullText:
              selectedAddress.fullText && selectedAddress.fullText.trim().length > 0
                ? selectedAddress.fullText
                : effectiveLocation!.fullText,
            area: selectedAddress.area || "Unknown",
            lat: Number(selectedAddress.lat),
            lng: Number(selectedAddress.lng),
          }
        : {
            type: resolvedType,
            label: resolvedLabel,
            fullText: effectiveLocation!.fullText,
            area:
              effectiveLocation!.area ||
              effectiveLocation!.city ||
              "Unknown",
            lat: effectiveLocation!.lat,
            lng: effectiveLocation!.lng,
          };

      const payload = {
        guestName: name.trim(),
        guestPhone: phone.trim(),
        // NOTE: `address` only carries fields the backend actually
        // accepts on its CheckoutDto (area, fullText, lat, lng, type,
        // label, landmark, postcode). `line1` and `city` were emitted
        // here historically but the backend `AddressDto` doesn't declare
        // them — they got silently dropped at the network boundary. We
        // remove them at the source so the payload matches the contract
        // and the persisted order's addressSnapshot doesn't depend on
        // fields that don't exist.
        address: {
          type: orderSource.type,
          label: orderSource.label,
          area: orderSource.area,
          landmark: landmark.trim() || undefined,
          fullText: orderSource.fullText,
          lat: orderSource.lat,
          lng: orderSource.lng,
        },
        items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        // Only send the code the user *confirmed* via the Apply button.
        // If they typed something but never hit Apply, we drop it
        // (instead of silently sending an unverified code that the
        // server would reject on order placement).
        couponCode: appliedCoupon?.code || undefined,
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
        const rawMsg =
          data?.message?.toString?.() ||
          (Array.isArray(data?.message)
            ? data.message.join(", ")
            : null) ||
          data?.error ||
          (lang === "en" ? `Order failed (${res.status})` : `অর্ডার ব্যর্থ (${res.status})`);

        // Server-side coupon rejection: Apply may have succeeded but by
        // the time we hit POST /checkout the coupon became invalid
        // (e.g. another tab just used the last redemption, or a
        // background job expired the code). Drop the applied state so
        // the green "Coupon applied" card doesn't linger while the
        // red error is on screen — and surface the same precise
        // message via `couponError` so the customer can immediately
        // understand WHY their code was rejected.
        if (
          res.status === 400 &&
          typeof rawMsg === "string" &&
          /coupon/i.test(rawMsg)
        ) {
          setAppliedCoupon(null);
          setCouponCode("");
          setCouponError(
            lang === "bn"
              ? "এই কুপনটি আর প্রযোজ্য নয় — অনুগ্রহ করে অন্য কোড দিন"
              : "This coupon is no longer valid — please try another code",
          );
        }

        // Special case: the server found that one or more cart items are
        // no longer purchasable (deleted / inactive / out-of-stock). Drop
        // them from local storage and bounce the user back to /cart so
        // they can review the cleaned cart instead of seeing a wall of
        // cryptic error text here.
        const isCartValidation =
          res.status === 400 &&
          (typeof rawMsg === "string" &&
            rawMsg.toLowerCase().includes("cart validation failed")) &&
          Array.isArray(data?.errors) &&
          data.errors.length > 0;
        if (isCartValidation) {
          const removed: string[] = [];
          for (const line of data.errors as string[]) {
            // "Product <id> not found"
            const m = /^Product\s+(\S+)\s+not found/.exec(line);
            if (m && items.some((it) => it.productId === m[1])) {
              cart.remove(m[1]);
              removed.push(m[1]);
            }
          }
          const removedCount = removed.length || data.errors.length;
          toast.error(
            lang === "en"
              ? `Some items in your cart are no longer available (${removedCount}). Please review your cart.`
              : `আপনার কার্টের কিছু পণ্য আর পাওয়া যাচ্ছে না (${removedCount})। কার্ট দেখুন।`,
          );
          // Don't throw — just send the user to the cart page where the
          // removed items will already be gone and they can place a fresh
          // order with whatever's left.
          try {
            router.push("/cart");
          } catch {
            window.location.href = "/cart";
          }
          return;
        }

        throw new Error(rawMsg);
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

      {/* Guest-blocked visitors hit the early `if (guestBlocked) return`
          above — this render path is only reached by logged-in users OR
          when admin has guest checkout enabled. */}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form — 3 sections: Contact, Address, Order */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Contact */}
          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4 sm:p-5">
            <h2 className="font-bold mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {tw("যোগাযোগের তথ্য", "Contact")}
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

          {/* Section 2: Address */}
          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4 sm:p-5">
            <h2 className="font-bold mb-1 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {tw("ডেলিভারি ঠিকানা", "Delivery address")}
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              {tw(
                auth.isAuthenticated
                  ? "একটি সংরক্ষিত ঠিকানা বেছে নিন অথবা ম্যাপে নতুন পিন দিন।"
                  : "ম্যাপে পিন টানুন, GPS শেয়ার করুন, অথবা ঠিকানা লিখুন — যেকোনো একটি ডেলিভারির জন্য যথেষ্ট।",
                auth.isAuthenticated
                  ? "Pick a saved address or drop a new pin on the map."
                  : "Drop a pin on the map, share your GPS, or type an address — any one is enough.",
              )}
            </p>
            {auth.isAuthenticated ? (
              <SavedAddressStep />
            ) : (
              // Guest flow — no saved-address UI (guests don't have any
              // and can't save either). Drop a pin / share GPS / type an
              // address via the map. The Save checkbox is also hidden for
              // guests via the `canOfferSave` guard.
              <>
                <LocationStepWrapperForGuest />
                <div className="mt-3">
                  <label className="text-sm font-medium mb-1 block">
                    {tw("ল্যান্ডমার্ক (ঐচ্ছিক)", "Landmark (optional)")}
                  </label>
                  <Input
                    placeholder={tw(
                      "যেমন: পুরাতন স্কুলের পাশে",
                      "e.g. next to the old school",
                    )}
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* "Save this address for next time" — only for logged-in users
                who picked a manual pin far from any saved row. */}
            {canOfferSave && pinIsFarFromSaved && (
              <label className="mt-3 flex items-center gap-2 text-xs text-ink-700 dark:text-ink-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-primary focus:ring-primary"
                  checked={saveAddressChecked}
                  onChange={(e) => setSaveAddressChecked(e.target.checked)}
                />
                {tw(
                  "পরবর্তী অর্ডারের জন্য এই ঠিকানাটি সংরক্ষণ করুন (বাড়ি)",
                  "Save this address for next time (Home)",
                )}
              </label>
            )}
          </section>

          {/* Section 3: Order (payment + notes + coupon) */}
          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4 sm:p-5">
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
                enabled={featureToggles.enableCOD}
              />
              <PaymentOption
                value="BKASH"
                label="bKash"
                sub={
                  featureToggles.enableBkash
                    ? tw("বিকাশের মাধ্যমে পেমেন্ট", "Pay via bKash")
                    : tw("শীঘ্রই আসছে", "Coming soon")
                }
                icon={<Phone className="h-5 w-5" />}
                selected={paymentMethod === "BKASH"}
                onSelect={() => setPaymentMethod("BKASH")}
                enabled={featureToggles.enableBkash}
              />
              <PaymentOption
                value="NAGAD"
                label="Nagad"
                sub={
                  featureToggles.enableNagad
                    ? tw("নগদের মাধ্যমে পেমেন্ট", "Pay via Nagad")
                    : tw("শীঘ্রই আসছে", "Coming soon")
                }
                icon={<Phone className="h-5 w-5" />}
                selected={paymentMethod === "NAGAD"}
                onSelect={() => setPaymentMethod("NAGAD")}
                enabled={featureToggles.enableNagad}
              />
            </div>
            {paymentMethod !== "COD" &&
              (paymentMethod === "BKASH" && !featureToggles.enableBkash) ||
            (paymentMethod === "NAGAD" && !featureToggles.enableNagad) ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                {tw(
                  "⚠️ এই পদ্ধতি এখনো সক্রিয় নয়। অনুগ্রহ করে ক্যাশ অন ডেলিভারি নির্বাচন করুন।",
                  "⚠️ This method is not active yet. Please choose Cash on Delivery.",
                )}
              </p>
            ) : null}
          </section>

          <section className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4 sm:p-5">
            <h2 className="font-bold mb-4">
              {tw("অতিরিক্ত তথ্য", "Additional info")}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  {tw("কুপন কোড (ঐচ্ছিক)", "Coupon code (optional)")}
                </label>
                {/* Coupon input row. The Apply button next to the input
                    triggers `applyCoupon`, which calls GET /coupons/:code
                    to verify the code is real and active BEFORE we include
                    it in the order. Without this step, an invalid code
                    would either silently charge full price (the customer
                    thought they got a discount but didn't) or fail at
                    order placement with an opaque server error. */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder={tw("যেমন: WELCOME10", "e.g. WELCOME10")}
                      value={couponCode}
                      onChange={(e) => onCouponInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        // Submit on Enter — same as clicking Apply.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!couponApplying) applyCoupon();
                        }
                      }}
                      disabled={!!appliedCoupon}
                      // Lock the input once the coupon is confirmed so
                      // the customer can't accidentally edit the
                      // confirmed code into something unverified. They
                      // can still click "Remove" to start over.
                      className={appliedCoupon ? "pr-10 font-mono uppercase" : "font-mono uppercase"}
                    />
                    {appliedCoupon && (
                      <button
                        type="button"
                        onClick={removeCoupon}
                        aria-label={tw("কুপন মুছুন", "Remove coupon")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyCoupon}
                    disabled={couponApplying || !couponCode.trim() || !!appliedCoupon}
                    className="shrink-0"
                  >
                    {couponApplying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Tag className="h-4 w-4" />
                        {tw("প্রয়োগ", "Apply")}
                      </>
                    )}
                  </Button>
                </div>
                {/* Inline error after a failed apply. Cleared as soon
                    as the user starts typing again (see
                    `onCouponInputChange`). Kept short — single line. */}
                {couponError && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-danger-500">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {couponError}
                  </p>
                )}
                {/* Confirmed-coupon card. Replaces the input row's hint
                    with the actual discount the user will get, so the
                    customer can verify before placing the order. */}
                {appliedCoupon && (
                  <div className="mt-2 flex items-start gap-2 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-xs text-success-700 dark:border-success-200 dark:bg-success-100 dark:text-success-700">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold">
                        {lang === "bn"
                          ? `কুপন "${appliedCoupon.code}" প্রয়োগ হয়েছে`
                          : `Coupon "${appliedCoupon.code}" applied`}
                      </div>
                      <div className="text-success-700 dark:text-success-700 mt-0.5">
                        {appliedCoupon.type === "PERCENT"
                          ? lang === "bn"
                            ? `${appliedCoupon.value}% ছাড়`
                            : `${appliedCoupon.value}% off`
                          : lang === "bn"
                            ? `৳${appliedCoupon.value} ছাড়`
                            : `৳${appliedCoupon.value} off`}
                        {appliedCoupon.minOrder != null && Number(appliedCoupon.minOrder) > 0 && (
                          <>
                            {" · "}
                            {lang === "bn"
                              ? `ন্যূনতম অর্ডার ৳${appliedCoupon.minOrder}`
                              : `min order ৳${appliedCoupon.minOrder}`}
                          </>
                        )}
                        {appliedCoupon.maxDiscount != null && Number(appliedCoupon.maxDiscount) > 0 && (
                          <>
                            {" · "}
                            {lang === "bn"
                              ? `সর্বোচ্চ ছাড় ৳${appliedCoupon.maxDiscount}`
                              : `max discount ৳${appliedCoupon.maxDiscount}`}
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="ml-1 rounded px-2 py-0.5 text-xs font-medium text-success-700 hover:bg-success-100 dark:hover:bg-success-200"
                    >
                      {tw("মুছুন", "Remove")}
                    </button>
                  </div>
                )}
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
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4 sm:p-5 sticky top-32 space-y-4">
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
                !effectiveLocation ||
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
              ) : !effectiveLocation ? (
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
 * Wrapper around the dynamic-imported <LocationStep /> used in the guest
 * flow. Mirrors `LocationStepWrapper` in saved-address-step.tsx — but
 * without an `onPickMap` callback (the guest doesn't need to react;
 * the map just drives the location store directly).
 *
 * Why a wrapper at all: LocationStep is `dynamic(..., { ssr: false })`
 * so it can't be called with React hooks from a server context. The
 * wrapper is a tiny client component that owns the store hook and
 * forwards value/onChange.
 */
function LocationStepWrapperForGuest() {
  const location = useLocationStore((s) => s.location);
  const setLocation = useLocationStore((s) => s.setLocation);
  return (
    <LocationStep
      value={location}
      onChange={(loc) => setLocation(loc ?? null)}
    />
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
