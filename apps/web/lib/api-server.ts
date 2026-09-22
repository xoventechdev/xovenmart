/**
 * Server-side API helper for Server Components / Route Handlers.
 * No token storage — uses absolute URL with no auth for public data.
 *
 * Always appends `/api/v1` to the base URL, regardless of whether the env
 * var includes it. Callers pass paths WITHOUT the prefix (e.g.
 * `apiServer.get("/catalog/categories")`). The API lives at `/api/v1/*`.
 */
function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  // Strip any trailing `/api/v1` the operator may have included, so we don't
  // end up with `/api/v1/api/v1/foo` after concatenation.
  const base = raw.replace(/\/api\/v\d+\/?$/, "");
  return `${base}/api/v1`;
}
const API_URL = resolveApiBase();

// Next.js exposes the build phase via `process.env.NEXT_PHASE`. During
// `next build` it's "phase-production-build". When we're building the
// image, the api container isn't running yet, so any fetch() call would
// hang for 60s on connect-refused and blow up the build. Skip the fetch
// entirely and return an empty result. Runtime fetches are unaffected.
const SKIP_DURING_BUILD =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.SKIP_API_DURING_BUILD === "1";

export const apiServer = {
  async get(path: string): Promise<any> {
    if (SKIP_DURING_BUILD) {
      // eslint-disable-next-line no-console
      console.warn(`apiServer.get(${path}) skipped (build phase)`);
      return {};
    }
    try {
      // Hard 5s timeout via AbortController. With `next: { revalidate:
      // 300 }` Next 15 will cache this for 5 minutes, but during a
      // cold-render (e.g. the prerender pass) the fetch has to either
      // resolve or fail fast. Connect-refused against localhost:3001
      // would otherwise hang 60s and abort the build.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${API_URL}${path}`, {
        next: { revalidate: 300 },
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`API ${path} → ${res.status}`);
      }
      return res.json();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`apiServer.get(${path}) failed:`, (e as Error).message);
      return {};
    }
  },

  async post(path: string, body: any): Promise<any> {
    if (SKIP_DURING_BUILD) {
      return {};
    }
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API ${path} → ${res.status}`);
    }
    return res.json();
  },
};
