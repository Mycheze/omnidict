"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

/**
 * Header account button: "Sign in with Refold" when logged out, a small
 * account menu (name/email + sign out) when logged in.
 */
export function AccountBadge() {
  const { user, isLoading, login, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on outside clicks
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  if (isLoading) {
    return null;
  }

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={login}
        title="Sign in with Refold"
      >
        <LogIn className="h-4 w-4 mr-2" />
        Sign in with Refold
      </Button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMenuOpen((open) => !open)}
        title={user.email}
      >
        <User className="h-4 w-4 mr-2" />
        <span className="max-w-[10rem] truncate">
          {user.name || user.email}
        </span>
      </Button>
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border bg-card p-3 shadow-md z-50">
          <p className="text-sm font-medium truncate">
            {user.name || user.email}
          </p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            {user.tier} tier
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setMenuOpen(false);
              logout();
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
