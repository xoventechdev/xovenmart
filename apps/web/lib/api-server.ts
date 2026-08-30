/**
 * Server-side API helper for Server Components / Route Handlers.
 * No token storage — uses absolute URL with no auth for public data.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

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
