"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from "react-leaflet";

if (typeof window !== "undefined") {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    iconUrl: "/leaflet/marker-icon.png",
    shadowUrl: "/leaflet/marker-shadow.png",
  });
}

interface Props {
  center: { lat: number; lng: number };
  radiusKm: number;
  zoneName?: string;
}

/**
 * Read-only map used in the admin "Zone Editor" → "View on map" modal.
 * Shows a single marker at the zone center plus a translucent circle for
 * the radius (in km → meters). No drag, no click-to-set; admin must edit
 * the lat/lng inputs to move the pin.
 *
 * MUST be loaded via `next/dynamic({ ssr: false })` since Leaflet needs
 * the DOM / window object at import time.
 */
export default function ZonePreviewMap({ center, radiusKm, zoneName }: Props) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={radiusKmToZoom(radiusKm)}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={true}
      dragging={true}
      zoomControl={true}
      doubleClickZoom={true}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <FitOnOpen center={center} radiusKm={radiusKm} />
      <Marker position={[center.lat, center.lng]} title={zoneName} />
      <Circle
        center={[center.lat, center.lng]}
        radius={Math.max(50, radiusKm * 1000)} // meters
        pathOptions={{
          color: "#2563eb",
          weight: 2,
          opacity: 0.8,
          fillColor: "#3b82f6",
          fillOpacity: 0.12,
        }}
      />
    </MapContainer>
  );
}

/**
 * On first mount (and when center changes meaningfully), fit the map view
 * to show the entire radius circle. Uses Leaflet's `fitBounds` so the
 * radius is fully visible regardless of its size.
 */
function FitOnOpen({ center, radiusKm }: { center: { lat: number; lng: number }; radiusKm: number }) {
  const map = useMap();
  const lastRef = useRef<string>("");
  useEffect(() => {
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)},${radiusKm}`;
    if (key === lastRef.current) return;
    lastRef.current = key;
    const meters = Math.max(200, radiusKm * 1000);
    // Build a tiny bounds object using Leaflet's internal helper via `map`
    const c = L.latLng(center.lat, center.lng);
    const offsetLat = meters / 111320; // ~deg latitude per meter
    const offsetLng = meters / (111320 * Math.cos((center.lat * Math.PI) / 180));
    const bounds = L.latLngBounds(
      [c.lat - offsetLat, c.lng - offsetLng],
      [c.lat + offsetLat, c.lng + offsetLng],
    );
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
  }, [center.lat, center.lng, radiusKm, map]);
  return null;
}

/**
 * Pick a sensible zoom level for very small or very large radii so the
 * user gets a useful initial view. fitBounds() above will adjust this
 * once the map mounts, but having a non-default center is helpful too.
 */
function radiusKmToZoom(km: number): number {
  if (!Number.isFinite(km) || km <= 0) return 13;
  if (km <= 1) return 15;
  if (km <= 3) return 14;
  if (km <= 10) return 12;
  if (km <= 30) return 10;
  if (km <= 100) return 8;
  return 6;
}