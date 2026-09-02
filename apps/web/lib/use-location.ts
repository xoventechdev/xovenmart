"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeliveryLocation } from "./location";

interface LocationState {
  location: DeliveryLocation | null;
  /**
   * Id of the saved-address row the user picked. When set, the checkout
   * step knows which saved row is "active" — even if the location is later
   * nudged by a map drag. Cleared when the user types a fresh location.
   *
   * Persisted across reloads so the picker chip stays highlighted.
   */
  pickedAddressId: string | null;
  setLocation: (
    loc: DeliveryLocation | null,
    opts?: { addressId?: string | null },
  ) => void;
  /** Forget any saved-address association without clearing the location. */
  clearPickedAddressId: () => void;
}

/**
 * Persistent delivery-location store. Used by the checkout flow and (in
 * future) by a header chip showing "ডেলিভারি: <area>".
 *
 * NOTE: We only persist lat/lng/fullText — not line1/area/etc — because
 * rehydrating those fields is unnecessary for the use cases we have today.
 * The full DeliveryLocation is always rebuilt by reverseGeocode at usage.
 */
export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      location: null,
      pickedAddressId: null,
      setLocation: (loc, opts) =>
        set((s) => ({
          location: loc,
          // If the caller passes an explicit addressId, use that. Otherwise:
          //   - if they're clearing the location, also clear the picked id
          //   - if they're setting a non-null location but didn't pass an
          //     id, leave the previous one alone (e.g. map drag should
          //     not silently un-link the saved Home address)
          pickedAddressId:
            opts && Object.prototype.hasOwnProperty.call(opts, "addressId")
              ? opts.addressId ?? null
              : loc === null
                ? null
                : s.pickedAddressId,
        })),
      clearPickedAddressId: () => set({ pickedAddressId: null }),
    }),
    {
      name: "xm-location",
      partialize: (state) => ({
        location: state.location
          ? {
              lat: state.location.lat,
              lng: state.location.lng,
              fullText: state.location.fullText,
              line1: state.location.line1,
              area: state.location.area,
              city: state.location.city,
              postcode: state.location.postcode,
              source: state.location.source,
            }
          : null,
        pickedAddressId: state.pickedAddressId,
      }),
    },
  ),
);

/** Helper to set a location picked from a saved address. */
export function pickSavedLocation(loc: DeliveryLocation, addressId: string) {
  useLocationStore.getState().setLocation(loc, { addressId });
}
