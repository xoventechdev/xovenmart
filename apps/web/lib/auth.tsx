"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { api, ApiError } from "./api";

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  email?: string | null;
  referralCode: string;
}

export interface OtpRequestResponse {
  ok: boolean;
  message: string;
  expiresAt: string;
  /** Returned only when NODE_ENV !== "production" */
  devCode?: string;
}

export interface VerifyOtpResponse {
  ok: boolean;
  phoneVerified: boolean;
  registrationRequired?: boolean;
  firstTimeSetupRequired?: boolean;
  phone?: string;
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  message?: string;
}

export interface LoginResponse {
  ok: boolean;
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

interface AuthCtx {
  user: AuthUser | null;
  /** True until the initial /auth/me call settles. */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Force a re-fetch from /auth/me (e.g. after login from another tab). */
  refreshMe: () => Promise<void>;
  /** Sign in with phone + password. Throws ApiError on auth failure. */
  login: (phone: string, password: string) => Promise<AuthUser>;
  /** Request a registration OTP for a phone. */
  requestRegistrationOtp: (phone: string) => Promise<OtpRequestResponse>;
  /** Verify an OTP — branches on `firstTimeSetupRequired`/`registrationRequired`. */
  verifyOtp: (phone: string, code: string) => Promise<VerifyOtpResponse>;
  /** Complete registration after a phone+OTP verification. */
  register: (payload: {
    phone: string;
    name: string;
    password: string;
    email?: string;
    referralCode?: string;
    otpCode?: string;
  }) => Promise<AuthUser>;
  /** Request a password-reset OTP. Always resolves (no enumeration). */
  forgotPassword: (phone: string) => Promise<OtpRequestResponse>;
  /** Verify a reset OTP and set a new password. */
  resetPassword: (phone: string, otpCode: string, newPassword: string) => Promise<AuthUser>;
  /** Clear local tokens + user state. */
  logout: () => Promise<void>;
  /** Update the current user's profile (name + email). Merges response into local user state. */
  updateProfile: (patch: { name?: string; email?: string | null }) => Promise<AuthUser>;
  /** Last ApiError from a login attempt, useful for inline UX. */
  lastError: ApiError | null;
}

const AuthContext = createContext<AuthCtx | null>(null);

const STORAGE_ACCESS = "xm-auth.accessToken";
const STORAGE_REFRESH = "xm-auth.refreshToken";
const STORAGE_AUDIENCE = "xm-auth.audience";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<ApiError | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refreshMe = useCallback(async () => {
    if (!api.isAuthenticated()) {
      setUser(null);
      return;
    }
    try {
      const me = await api.get<{ role: string; user?: AuthUser; admin?: any; rider?: any }>(
        "/auth/me",
      );
      if (me.role === "CUSTOMER" && me.user) {
        setUser({
          id: me.user.id,
          phone: me.user.phone,
          name: me.user.name,
          email: me.user.email,
          referralCode: me.user.referralCode,
        });
      } else {
        // Admin / rider tokens don't count as customer auth.
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    }
  }, []);

  // Initial mount: call /auth/me (uses api client's existing tokens)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!api.isAuthenticated()) {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }
      try {
        await refreshMe();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  // React to token changes from any source (login, logout, expiry).
  useEffect(() => {
    function onChange() {
      refreshInFlight.current = (async () => {
        if (!api.isAuthenticated()) {
          setUser(null);
          return;
        }
        await refreshMe();
      })();
      refreshInFlight.current.finally(() => {
        refreshInFlight.current = null;
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("xm-auth-change", onChange);
      return () => window.removeEventListener("xm-auth-change", onChange);
    }
    return undefined;
  }, [refreshMe]);

  const login = useCallback(async (phone: string, password: string): Promise<AuthUser> => {
    setLastError(null);
    try {
      const res = await api.post<LoginResponse>("/auth/customer/login", { phone, password });
      api.setTokens(
        {
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          expiresAt: res.expiresAt,
        },
        "customer",
      );
      setUser(res.user);
      return res.user;
    } catch (e) {
      if (e instanceof ApiError) setLastError(e);
      throw e;
    }
  }, []);

  const requestRegistrationOtp = useCallback(async (phone: string) => {
    return api.post<OtpRequestResponse>("/auth/customer/request-otp", { phone });
  }, []);

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const res = await api.post<VerifyOtpResponse>("/auth/customer/verify-otp", { phone, code });
    // Only stash tokens if the backend issued them (returning user OTP login).
    if (res.accessToken && res.refreshToken && res.expiresAt) {
      api.setTokens(
        { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresAt: res.expiresAt },
        "customer",
      );
      if (res.user) setUser(res.user);
    }
    return res;
  }, []);

  const register = useCallback(
    async (payload: {
      phone: string;
      name: string;
      password: string;
      email?: string;
      referralCode?: string;
      otpCode?: string;
    }): Promise<AuthUser> => {
      const res = await api.post<LoginResponse>("/auth/customer/register", payload);
      api.setTokens(
        {
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          expiresAt: res.expiresAt,
        },
        "customer",
      );
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const forgotPassword = useCallback(async (phone: string) => {
    return api.post<OtpRequestResponse>("/auth/customer/forgot-password", { phone });
  }, []);

  const resetPassword = useCallback(
    async (phone: string, otpCode: string, newPassword: string): Promise<AuthUser> => {
      const res = await api.post<LoginResponse>("/auth/customer/reset-password", {
        phone,
        otpCode,
        newPassword,
      });
      api.setTokens(
        {
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          expiresAt: res.expiresAt,
        },
        "customer",
      );
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      // Best-effort revoke; ignore errors so logout always feels instant.
      await api.post("/auth/customer/logout", {}).catch(() => null);
    } finally {
      api.clearTokens();
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(
    async (patch: { name?: string; email?: string | null }): Promise<AuthUser> => {
      const res = await api.patch<{ user: AuthUser }>("/customers/me", {
        name: patch.name,
        // Send null (not undefined) when the caller wants to clear the email.
        email: patch.email === undefined ? undefined : patch.email,
      });
      setUser((prev) =>
        prev
          ? {
              ...prev,
              name: res.user.name,
              email: res.user.email,
            }
          : prev,
      );
      return res.user;
    },
    [],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      refreshMe,
      login,
      requestRegistrationOtp,
      verifyOtp,
      register,
      forgotPassword,
      resetPassword,
      logout,
      updateProfile,
      lastError,
    }),
    [
      user,
      isLoading,
      refreshMe,
      login,
      requestRegistrationOtp,
      verifyOtp,
      register,
      forgotPassword,
      resetPassword,
      logout,
      updateProfile,
      lastError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

// Re-export storage keys (kept here so future refactors have a single source of truth).
export const AUTH_STORAGE = {
  access: STORAGE_ACCESS,
  refresh: STORAGE_REFRESH,
  audience: STORAGE_AUDIENCE,
};
