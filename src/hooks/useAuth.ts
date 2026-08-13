"use client";

import { useContext } from "react";
import { AuthContext, AuthContextValue } from "@/components/auth/AuthProvider";

/** Access the auth context. Throws when used outside an AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
