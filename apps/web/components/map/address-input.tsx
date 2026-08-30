"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchPlaces, type DeliveryLocation } from "@/lib/location";

interface Props {
  onPick: (loc: DeliveryLocation) => void;
  initialQuery?: string;
}

/**
 * Type-to-search address input. Forwards geocodes the typed query via
 * Nominatim (debounced 350ms) and shows up to 5 candidate cards. Picking
 * one calls `onPick(location)`.
 *
 * Reverse-geocoding happens in the parent (LocationStep) so that the
 * map preview can show a pin at the picked location.
 */
export function AddressInput({ onPick, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<DeliveryLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    setError(null);
    const t = setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      setLoading(true);
      try {
        const r = await searchPlaces(q);
        if (myReq !== reqIdRef.current) return; // stale
        setResults(r);
        if (r.length === 0) setError("কোনো ঠিকানা পাওয়া যায়নি — আরো বিস্তারিত লিখুন");
      } catch {
        if (myReq === reqIdRef.current) setError("অনুসন্ধান ব্যর্থ হয়েছে");
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="যেমন: মুডাফরগঞ্জ বাজার, লাকসাম সদর..."
          className="pl-9 pr-9"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <div className="flex items-start gap-1.5 rounded-md bg-ink-50 px-2.5 py-1.5 text-xs text-muted-foreground dark:bg-ink-800">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <ul className="space-y-1.5">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery(r.fullText.split(",")[0] || r.fullText);
                  setResults([]);
                }}
                className="group flex w-full items-start gap-2 rounded-md border border-ink-200 bg-white p-2.5 text-left hover:border-primary-300 hover:bg-primary-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-primary-900/30"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900 dark:text-ink-50">
                    {r.fullText.split(",").slice(0, 2).join(",") || r.fullText}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.fullText}
                  </span>
                </span>
                <span className="text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100">
                  নির্বাচন →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}