/**
 * Location helpers — Nominatim-backed geocoding for the checkout address picker.
 *
 * - Reverse-geocode lat/lng → DeliveryLocation (drag-pin on map)
 * - Forward-geocode typed query → candidate DeliveryLocation[] (address search)
 * - GPS helper around navigator.geolocation
 *
 * Nominatim usage policy: max 1 req/sec, descriptive referer. We:
 *   - Cache results in sessionStorage for 5 minutes, keyed by rounded lat/lng
 *     (reverse) or by the typed query (forward)
 *   - Throttle forward searches with a 300ms debounce in AddressInput
 *   - Send a custom `Accept-Language: bn,en` header so Bangla names come back
 */

export type LocationSource = "gps" | "map" | "typed";

export interface DeliveryLocation {
  lat: number;
  lng: number;
  /** Full human-readable address, joined for display */
  fullText: string;
  /** Street + house number */
  line1: string;
  /** Neighborhood / mouza / village */
  area: string;
  /** Upazila / city / town */
  city: string;
  /** Optional postcode */
  postcode?: string;
  /** Where this location came from */
  source: LocationSource;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`xm-loc:${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (entry.expiresAt < Date.now()) return null;
    return entry.value;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    sessionStorage.setItem(`xm-loc:${key}`, JSON.stringify(entry));
  } catch {}
}

/** Round to 5 decimals (~1.1m precision) for cache keys */
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Reverse-geocode {lat, lng} into a DeliveryLocation via Nominatim.
 * Returns null if no result or network failure.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<DeliveryLocation | null> {
  const key = `rev:${round5(lat)},${round5(lng)}`;
  const cached = readCache<DeliveryLocation>(key);
  if (cached) return { ...cached, source: "map" };

  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=bn,en`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = parseNominatimResult(data);
    if (!parsed) return null;
    writeCache(key, parsed);
    return { ...parsed, source: "map" };
  } catch {
    return null;
  }
}

/**
 * Forward-geocode a typed query into up to N candidate DeliveryLocations.
 * Used by AddressInput — debounce 300ms before calling.
 */
export async function searchPlaces(
  query: string,
  limit = 5,
): Promise<DeliveryLocation[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = `fwd:${q.toLowerCase()}`;
  const cached = readCache<DeliveryLocation[]>(key);
  if (cached) return cached.map((c) => ({ ...c, source: "typed" }));

  try {
    const url = `${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=${limit}&addressdetails=1&accept-language=bn,en&countrycodes=bd`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as any[];
    const parsed = data
      .map(parseNominatimResult)
      .filter((x): x is DeliveryLocation => x !== null);
    if (parsed.length > 0) writeCache(key, parsed);
    return parsed.map((p) => ({ ...p, source: "typed" }));
  } catch {
    return [];
  }
}

/**
 * Promise wrapper around navigator.geolocation. Resolves with {lat,lng} or
 * rejects with a user-friendly Bangla message.
 */
export function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("আপনার ব্রাউজার লোকেশন সমর্থন করে না"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const map: Record<number, string> = {
          1: "অনুগ্রহ করে লোকেশন অনুমতি দিন",
          2: "লোকেশন পাওয়া যায়নি",
          3: "লোকেশন পেতে অনেক দেরি হচ্ছে",
        };
        reject(new Error(map[err.code] ?? "লোকেশন পাওয়া যায়নি"));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

/**
 * Convert a Nominatim result (either reverse or search) into our
 * DeliveryLocation shape. Returns null if there's no usable info.
 */
function parseNominatimResult(r: any): DeliveryLocation | null {
  if (!r || typeof r.lat !== "string" || typeof r.lon !== "string") return null;
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (!isFinite(lat) || !isFinite(lng)) return null;

  const a = r.address ?? {};
  const line1 =
    [a.house_number, a.road].filter(Boolean).join(" ").trim() ||
    a.neighbourhood ||
    a.suburb ||
    "";
  const area =
    a.neighbourhood ||
    a.suburb ||
    a.village ||
    a.hamlet ||
    a.quarter ||
    "";
  const city =
    a.city ||
    a.town ||
    a.municipality ||
    a.county ||
    a.state_district ||
    a.state ||
    "";
  const postcode = a.postcode ?? undefined;

  // Build fullText: prefer Bangla display_name, fall back to joined parts
  const fullText =
    r.display_name ||
    [line1, area, city, postcode].filter(Boolean).join(", ") ||
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  return {
    lat,
    lng,
    fullText,
    line1: line1 || fullText.split(", // ")[0],
    area,
    city,
    postcode,
    source: "map",
  };
}

/** Default map center (Mudaforgonj bazaar) — used when no location yet */
export const DEFAULT_CENTER = { lat: 23.7853, lng: 91.1153 } as const;
export const DEFAULT_ZOOM = 14;