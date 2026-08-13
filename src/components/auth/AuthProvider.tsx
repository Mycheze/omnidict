"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSettingsSync } from "@/hooks/useSettingsSync";

export interface AuthUser {
  refoldUserId: number;
  email: string;
  name: string;
  tier: string;
  paid: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAuthUser(value: unknown): AuthUser | null {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const { refoldUserId, email, name, tier, paid } = value.user;
  if (
    typeof refoldUserId !== "number" ||
    typeof email !== "string" ||
    typeof name !== "string" ||
    typeof tier !== "string" ||
    typeof paid !== "boolean"
  ) {
    return null;
  }
  return { refoldUserId, email, name, tier, paid };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Server-side settings sync for the signed-in user. Mounted here (inside
  // the provider, keyed on the user id) so every page gets sync without
  // wiring the hook into individual components.
  useSettingsSync(user ? user.refoldUserId : null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data: unknown = await response.json();
      setUser(parseAuthUser(data));
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(() => {
    window.location.assign("/api/auth/login");
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Session cookie clearing failed server-side; still drop local state.
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
