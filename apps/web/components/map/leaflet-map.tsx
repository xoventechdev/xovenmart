"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "@/lib/location";

// Fix Leaflet's default icon paths (it tries to load from /node_modules/.../images
// which webpack doesn't bundle). Point at copies in /public/leaflet/.
if (typeof window !== "undefined") {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    iconUrl: "/leaflet/marker-icon.png",
    shadowUrl: "/leaflet/marker-shadow.png",
  });
}

interface Props {
  value: { lat: number; lng: number };
  onChange: (v: { lat: number; lng: number }) => void;
  readOnly?: boolean;
}

/**
 * Inner Leaflet map — must never be SSR'd.
 * - Single draggable Marker whose position is fully controlled by `value`.
 * - Click anywhere on the map → moves the marker.
 * - Drag end → fires onChange.
 */
export default function LeafletMap({ value, onChange, readOnly = false }: Props) {
  return (
    <MapContainer
      center={[value.lat, value.lng]}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom={!readOnly}
      dragging={!readOnly}
      doubleClickZoom={!readOnly}
      zoomControl={!readOnly}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <ClickHandler onChange={onChange} readOnly={readOnly} />
      <RecenterOn value={value} />
      <Marker
        position={[value.lat, value.lng]}
        draggable={!readOnly}
        eventHandlers={{
          dragend: (e) => {
            if (readOnly) return;
            const m = e.target as L.Marker;
            const ll = m.getLatLng();
            onChange({ lat: ll.lat, lng: ll.lng });
          },
        }}
      />
    </MapContainer>
  );
}

function ClickHandler({
  onChange,
  readOnly,
}: {
  onChange: (v: { lat: number; lng: number }) => void;
  readOnly?: boolean;
}) {
  useMapEvents({
    click: (e) => {
      if (readOnly) return;
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/**
 * When `value` changes from outside (e.g. GPS button), recenter the map
 * to match without interfering with user-initiated drags.
 */
function RecenterOn({ value }: { value: { lat: number; lng: number } }) {
  const map = useMap();
  const lastRef = useRef<string>("");
  useEffect(() => {
    const key = `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
    if (key === lastRef.current) return;
    lastRef.current = key;
    map.panTo([value.lat, value.lng], { animate: true });
  }, [value.lat, value.lng, map]);
  return null;
}