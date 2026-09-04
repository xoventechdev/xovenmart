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
 * Default Nominatim zoom for a fresh pin drop.
 *
 * - `14` returns village/municipality/district — the admin hierarchy
 *   we want to surface in the UI ("ঘটালিয়াপাড়া, চৌদ্দগ্রাম পৌরসভা,
 *   কুমিল্লা"). Pin-drops in rural Bangladesh rarely have a named
 *   street/road at zoom 18, so the higher zoom returns an empty
 *   `area` for most users.
 * - Callers in dense urban areas can opt up to 18 by passing
 *   `{ zoom: 18 }` to get the house number + road.
 */
export const REVERSE_GEOCODE_ZOOM = 14;

/**
 * Reverse-geocode {lat, lng} into a DeliveryLocation via Nominatim.
 * Returns null if no result or network failure.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  opts?: { zoom?: number },
): Promise<DeliveryLocation | null> {
  const zoom = opts?.zoom ?? REVERSE_GEOCODE_ZOOM;
  const key = `rev:${round5(lat)},${round5(lng)}`;
  const cached = readCache<DeliveryLocation>(key);
  if (cached) return { ...cached, source: "map" };

  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1&accept-language=bn,en`;
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

  // Street-level: house number + road only. Fall back to a
  // neighbourhood/suburb name if Nominatim didn't tag the road.
  const line1 =
    [a.house_number, a.road].filter(Boolean).join(" ").trim() ||
    a.neighbourhood ||
    a.suburb ||
    "";

  // "Most-specific local name" — what the reference site shows as the
  // big title. We try the granular address fields first, then fall back
  // to the entity `name` when the matched place is itself a populated
  // locality (village/town/city/hamlet). For Bangladeshi towns this is
  // essential: a pin in Chowdagram town returns `town: "চৌদ্দগ্রাম"`
  // with no `village` / `neighbourhood`, so without the `r.name`
  // fallback the title would silently fall through to the upazila
  // (county), which is what the user reported as "only big area name".
  const area =
    a.neighbourhood ||
    a.suburb ||
    a.village ||
    a.hamlet ||
    a.quarter ||
    // Pin landed directly on a populated place (Nominatim's `name` is
    // the entity's own name — e.g. "চৌদ্দগ্রাম" when the user drops
    // the pin inside Chowdagram town). This is the root-level name
    // we want to surface.
    ((r.addresstype === "village" ||
      r.addresstype === "town" ||
      r.addresstype === "city" ||
      r.addresstype === "hamlet" ||
      r.addresstype === "suburb" ||
      r.addresstype === "neighbourhood") &&
      typeof r.name === "string"
      ? r.name
      : "") ||
    "";

  // Admin hierarchy: district / upazila / division. We deliberately
  // skip `city` here so the subtitle doesn't repeat the title (e.g. a
  // pin in Dhaka city shouldn't say "Dhaka, Dhaka"). For Bangladesh
  // the most useful second line is the upazila (county) or district
  // (state_district).
  const city =
    a.municipality ||
    a.county ||
    a.state_district ||
    a.city ||
    a.town ||
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
/** Zone-level zoom — wide enough to see the whole delivery zone + a
 *  marker at its center. Used when no specific pin is loaded yet. */
export const DEFAULT_ZOOM = 14;
/** Pin-level zoom — used whenever we have a specific lat/lng to center
 *  on. Tighter than DEFAULT_ZOOM so a saved address shows up as a clear
 *  pin in the middle of the map instead of a small dot in a wide zone. */
export const PIN_ZOOM = 16;
