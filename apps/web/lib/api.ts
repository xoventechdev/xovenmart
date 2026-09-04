/**
 * Centralized API client — handles auth token storage, refresh rotation,
 * and automatic retry on 401.
 *
 * Always appends `/api/v1` to the base URL. Callers pass paths WITHOUT the
 * prefix (e.g. `api.post("/auth/login", ...)`). The API lives at `/api/v1/*`.
 */
function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const base = raw.replace(/\/api\/v\d+\/?$/, "");
  return `${base}/api/v1`;
}
const API_URL = resolveApiBase();

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Extract a human-readable error message from an unknown thrown value.
 * Backend NestJS errors can be plain strings OR `{ message: string | string[] }`
 * shaped payloads — this normalizes both. Falls back to the supplied
 * default string when nothing usable is found.
 *
 * The address-book redesign (Phase A3) uses `ConflictException` to return
 * `{ message: "You already have a Home address — edit that one instead", field: "type" }`
 * from POST /customers/me/addresses. Callers that surface these errors via
 * toasts (e.g. /account/addresses, checkout address step) should call this
 * helper to make sure the friendly `message` field bubbles up instead of
 * a generic "Request failed" string.
 */
export function extractApiMessage(err: unknown, fallback = "Request failed"): string {
  if (err instanceof ApiError) {
    const raw = (err.data as any)?.message;
    if (typeof raw === "string" && raw.trim()) return raw;
    if (Array.isArray(raw) && raw.length > 0) return raw.join(", ");
    if (err.message && err.message !== "Request failed") return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;
  private audience: "customer" | "admin" | "rider" = "customer";
  private storageKey = "xm-auth";

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.accessToken = parsed.accessToken;
          this.refreshToken = parsed.refreshToken;
          this.audience = parsed.audience || "customer";
        }
      } catch {}
    }
  }

  setAudience(audience: "customer" | "admin" | "rider") {
    this.audience = audience;
    this.persist();
  }

  setTokens(tokens: TokenPair, audience?: "customer" | "admin" | "rider") {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    if (audience) this.audience = audience;
    this.persist();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("xm-auth-change"));
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(this.storageKey);
      // Clear the middleware-readable audience cookie too. The `Secure`
      // flag must match the original cookie's flags, otherwise the
      // browser will not clear it — so we re-evaluate `NODE_ENV` here
      // the same way `persist()` does. Inlined at build time so the
      // dev-only branch is dead-coded out of the production bundle.
      const isProd = process.env.NODE_ENV === "production";
      const securePart = isProd ? "; Secure" : "";
      document.cookie = `audience=; path=/; max-age=0; SameSite=Lax${securePart}`;
      window.dispatchEvent(new CustomEvent("xm-auth-change"));
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  getAudience() {
    return this.audience;
  }

  /**
   * Read-only accessor for the current access token. Used by callers
   * that have to bypass `api.request()` (e.g. multipart/form-data file
   * uploads where `Content-Type: application/json` would be wrong).
   * Returns `null` when there is no active session — callers should
   * gate the request on truthiness and surface a clear "please log in"
   * error instead of letting the API return a generic 401.
   *
   * Note: this is the in-memory token, which is always the freshest
   * value (it tracks the refresh-rotation cycle in
   * `refreshAccessToken()`). Do NOT re-read `localStorage` directly —
   * the stored value can lag behind by one rotation and produce a stale
   * 401 on the very first call after a token refresh.
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  private persist() {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      audience: this.audience,
    });
    localStorage.setItem(this.storageKey, payload);

    // Mirror auth state in cookies so Next.js middleware (server-side)
    // can gate `/admin` and `/rider` routes before any HTML is rendered.
    // Only the audience flag is needed server-side — the actual JWT stays
    // in localStorage to avoid CSRF surface. Middleware checks for presence
    // of the cookie; the API still validates the Bearer token on every request.
    const cookieVal = this.audience
      ? `audience=${this.audience}`
      : "audience=";
    // 30 days, path=/, SameSite=Lax so it's sent on top-level navigations.
    // Add `Secure` in production so the cookie is never sent over plain
    // HTTP — even if a future misconfig routes the admin panel through
    // http://, the middleware gate will reject the request. `process.env.NODE_ENV`
    // is inlined at build time, so the dev-only fallback is dead-coded
    // out of the production bundle (no runtime check, no env leak).
    const isProd = process.env.NODE_ENV === "production";
    const securePart = isProd ? "; Secure" : "";
    document.cookie = `${cookieVal}; path=/; max-age=2592000; SameSite=Lax${securePart}`;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) throw new Error("No refresh token");
    if (this.refreshPromise) return this.refreshPromise;

    const endpoint =
      this.audience === "admin" ? "/auth/admin/refresh" :
      this.audience === "rider" ? "/auth/rider/refresh" :
      "/auth/customer/refresh";

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
        if (!res.ok) throw new Error("Refresh failed");
        const data = await res.json();
        this.setTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
        });
      } catch (e) {
        this.clearTokens();
        throw e;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: any,
    opts: { retry?: boolean; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const url = `${API_URL}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...opts.headers,
    };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && opts.retry !== false && this.refreshToken) {
      try {
        await this.refreshAccessToken();
        return this.request(method, path, body, { ...opts, retry: false });
      } catch {
        // Refresh token also failed → JWT truly expired / revoked.
        // Clear local tokens and route the user to the RIGHT login page
        // for their audience. Previously this always redirected to
        // /admin/login which was wrong for customer-facing pages: a
        // shopper on /cart or /checkout whose session expired got
        // bounced to the staff admin login (and saw admin-only chrome
        // / could not log in as a customer from there).
        //
        // Audience is whatever `setAudience()` last wrote, which is the
        // truth we have on the client. The /auth/me refresh path in
        // auth.tsx will treat this as "logged out" and re-render.
        this.clearTokens();
        if (typeof window !== "undefined") {
          const path = window.location.pathname;
          const onCustomerLogin = path.startsWith("/login");
          const onAdminLogin = path.startsWith("/admin/login");
          const audience = this.getAudience();
          let loginUrl: string;
          if (audience === "admin") {
            loginUrl = "/admin/login";
          } else {
            // default + customer: always the customer login
            loginUrl = "/login";
          }
          if (path !== loginUrl && !onCustomerLogin && !onAdminLogin) {
            // Preserve where the user was so login can bounce them back.
            const next = encodeURIComponent(path + window.location.search);
            window.location.href = `${loginUrl}?next=${next}&expired=1`;
          }
        }
      }
    }

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // empty body
    }

    if (!res.ok) {
      throw new ApiError(
        res.status,
        data?.message || res.statusText || "Request failed",
        data
      );
    }

    return data as T;
  }

  get<T = any>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T = any>(path: string, body?: any) {
    return this.request<T>("POST", path, body);
  }
  patch<T = any>(path: string, body?: any) {
    return this.request<T>("PATCH", path, body);
  }
  put<T = any>(path: string, body?: any) {
    return this.request<T>("PUT", path, body);
  }
  delete<T = any>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

export const api = new ApiClient();
export { ApiError };
export type { TokenPair };
