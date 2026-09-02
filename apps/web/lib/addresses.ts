"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Customer's saved address — mirrors the `Address` Prisma model. Returned
 * by GET /customers/me/addresses. lat/lng are returned as numbers
 * (Prisma decimals → JSON numbers over the wire).
 *
 * `type` was added when we introduced the 3-slot address book (HOME / OFFICE
 * / OTHER). Old rows that pre-date the migration come back without `type`
 * (server-side default kicks in on next write) — for read paths we default
 * to `OTHER` so callers always see a slot.
 */
export type AddressType = "HOME" | "OFFICE" | "OTHER";

export interface CustomerAddress {
  id: string;
  type: AddressType;
  label: string | null;
  area: string;
  landmark: string | null;
  fullText: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
  createdAt: string;
}

export interface AddressPayload {
  type?: AddressType;
  label?: string | null;
  area: string;
  landmark?: string | null;
  fullText: string;
  /**
   * Map pin coordinates. REQUIRED — the backend rejects null lat/lng.
   * New addresses (Home / Office / Other) always need a pin so the
   * checkout can compute the delivery fee + zone later without forcing
   * the user to re-pick on the map.
   */
  lat: number;
  lng: number;
  isDefault?: boolean;
}

const KEY = ["customers", "addresses"] as const;

/**
 * Slot-completeness summary returned by GET /customers/me/addresses/slots.
 * Frontend uses this to decide which "Add Home / Office / Other" CTA to
 * render without re-deriving from the raw list.
 */
export interface AddressSlots {
  addresses: CustomerAddress[];
  hasHome: boolean;
  hasOffice: boolean;
  hasOther: boolean;
  defaultId: string | null;
}

const SLOTS_KEY = ["customers", "addresses", "slots"] as const;

/**
 * List the current customer's saved addresses. Disabled when not
 * authenticated so the query doesn't fire on the login page.
 */
export function useAddresses() {
  return useQuery<CustomerAddress[]>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await api.get<{ addresses: CustomerAddress[] }>(
        "/customers/me/addresses",
      );
      // Old rows that pre-date the `type` migration come back without
      // `type`. Fall back to OTHER so chips/UI always have a value.
      return (res.addresses ?? []).map((a): CustomerAddress => ({
        ...a,
        type: (a.type ?? "OTHER") as AddressType,
      }));
    },
    enabled: api.isAuthenticated(),
    staleTime: 30_000,
  });
}

/**
 * Slot-completeness summary — has the customer saved a Home / Office / Other
 * yet? Drives the "Add missing slot" CTAs in the checkout address step.
 */
export function useAddressSlots() {
  return useQuery<AddressSlots>({
    queryKey: SLOTS_KEY,
    queryFn: async () => {
      const res = await api.get<AddressSlots>("/customers/me/addresses/slots");
      return {
        addresses: (res.addresses ?? []).map((a): CustomerAddress => ({
          ...a,
          type: (a.type ?? "OTHER") as AddressType,
        })),
        hasHome: !!res.hasHome,
        hasOffice: !!res.hasOffice,
        hasOther: !!res.hasOther,
        defaultId: res.defaultId ?? null,
      };
    },
    enabled: api.isAuthenticated(),
    staleTime: 30_000,
  });
}

/** Invalidate the addresses cache — call after any create/update/delete. */
export function invalidateAddresses(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: KEY });
}

/** Invalidate the slots summary. */
export function invalidateSlots(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: SLOTS_KEY });
}

/** Invalidate BOTH caches at once — the common case after a save. */
export function invalidateAddressCaches(qc: ReturnType<typeof useQueryClient>) {
  invalidateAddresses(qc);
  invalidateSlots(qc);
}

export async function createAddress(payload: AddressPayload) {
  return api.post<{ address: CustomerAddress }>("/customers/me/addresses", {
    type: payload.type,
    label: payload.label ?? undefined,
    area: payload.area,
    landmark: payload.landmark ?? undefined,
    fullText: payload.fullText,
    lat: payload.lat ?? undefined,
    lng: payload.lng ?? undefined,
    isDefault: payload.isDefault ?? undefined,
  });
}

export async function updateAddress(id: string, payload: Partial<AddressPayload>) {
  return api.patch<{ address: CustomerAddress }>(
    `/customers/me/addresses/${encodeURIComponent(id)}`,
    {
      ...(payload.type !== undefined && { type: payload.type }),
      ...(payload.label !== undefined && { label: payload.label ?? undefined }),
      ...(payload.area !== undefined && { area: payload.area }),
      ...(payload.landmark !== undefined && {
        landmark: payload.landmark ?? undefined,
      }),
      ...(payload.fullText !== undefined && { fullText: payload.fullText }),
      ...(payload.lat !== undefined && { lat: payload.lat ?? undefined }),
      ...(payload.lng !== undefined && { lng: payload.lng ?? undefined }),
      ...(payload.isDefault !== undefined && { isDefault: payload.isDefault }),
    },
  );
}

export async function deleteAddress(id: string) {
  return api.delete<{ ok: true }>(`/customers/me/addresses/${encodeURIComponent(id)}`);
}