"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DeliveryLocation } from "./location";

interface LocationState {
  location: DeliveryLocation | null;
  setLocation: (loc: DeliveryLocation | null) => void;
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
    (set) => ({
      location: null,
      setLocation: (loc) => set({ location: loc }),
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
      }),
    },
  ),
);