"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/**
 * Customer's saved address — mirrors the `Address` Prisma model. Returned
 * by GET /customers/me/addresses. lat/lng are returned as numbers
 * (Prisma decimals → JSON numbers over the wire).
 */
export interface CustomerAddress {
  id: string;
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
  label?: string | null;
  area: string;
  landmark?: string | null;
  fullText: string;
  lat?: number | null;
  lng?: number | null;
  isDefault?: boolean;
}

const KEY = ["customers", "addresses"] as const;

/**
 * List the current customer's saved addresses. Disabled when not
 * authenticated so the query doesn't fire on the login page.
 */
export function useAddresses() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await api.get<{ addresses: CustomerAddress[] }>(
        "/customers/me/addresses",
      );
      return res.addresses ?? [];
    },
    enabled: api.isAuthenticated(),
    staleTime: 30_000,
  });
}

/** Invalidate the addresses cache — call after any create/update/delete. */
export function invalidateAddresses(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: KEY });
}

export async function createAddress(payload: AddressPayload) {
  return api.post<{ address: CustomerAddress }>("/customers/me/addresses", {
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
