/**
 * Centralized API client — handles auth token storage, refresh rotation,
 * and automatic retry on 401.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

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
      // Clear the middleware-readable audience cookie too.
      document.cookie = "audience=; path=/; max-age=0; SameSite=Lax";
      window.dispatchEvent(new CustomEvent("xm-auth-change"));
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  getAudience() {
    return this.audience;
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
    document.cookie = `${cookieVal}; path=/; max-age=2592000; SameSite=Lax`;
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
        this.clearTokens();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin/login") && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/admin/login";
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
