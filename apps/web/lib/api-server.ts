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

export const apiServer = {
  async get(path: string): Promise<any> {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        next: { revalidate: 300 },
        headers: { "Content-Type": "application/json" },
      });
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
