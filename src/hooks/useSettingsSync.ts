"use client";

import { useEffect, useRef } from "react";
import {
  applySyncedSettings,
  collectSyncedSettings,
} from "@/lib/sync/settingsSync";
import { useAIStore } from "@/stores/aiStore";
import { useAnkiStore } from "@/stores/ankiStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useSettingsStore } from "@/stores/settingsStore";

const PUSH_DEBOUNCE_MS = 2000;

/**
 * Keeps the signed-in user's settings synced with the server.
 *
 * Mounted once inside AuthProvider so every page gets sync. Lifecycle:
 *
 * - On login (userId becomes non-null): GET the server copy. If the server
 *   has one, apply it locally (server wins); if not, seed the server with
 *   the current local settings (first login).
 * - After that reconcile, subscribe to the four settings stores and push a
 *   debounced PUT on change. Pushes triggered by applySyncedSettings itself
 *   are suppressed via a ref guard, and pushes whose synced snapshot equals
 *   the last synced payload are skipped (so secret/runtime-only changes
 *   never hit the network).
 * - On logout: unsubscribe and stop pushing; local state is kept.
 *
 * All network failures are logged and otherwise ignored — the next store
 * change retries naturally.
 */
export function useSettingsSync(userId: number | null): void {
  // True while applySyncedSettings is mutating the stores, so the resulting
  // subscription callbacks don't schedule an echo push back to the server.
  const applyingRef = useRef(false);

  // JSON of the last payload known to match the server; used to skip
  // pushes when nothing syncable actually changed.
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (userId === null) return;

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribers: Array<() => void> = [];

    const push = async (): Promise<void> => {
      const payload = collectSyncedSettings();
      const json = JSON.stringify(payload);
      if (json === lastSyncedRef.current) return;

      try {
        const response = await fetch("/api/user/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: json,
        });
        if (!response.ok) {
          console.error(
            `[settings-sync] Push failed with status ${response.status}`,
          );
          return;
        }
        lastSyncedRef.current = json;
      } catch (error) {
        console.error("[settings-sync] Push failed:", error);
      }
    };

    const schedulePush = (): void => {
      if (applyingRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (!cancelled) void push();
      }, PUSH_DEBOUNCE_MS);
    };

    const reconcile = async (): Promise<void> => {
      try {
        const response = await fetch("/api/user/settings");
        if (!response.ok) {
          throw new Error(`GET failed with status ${response.status}`);
        }
        const data: unknown = await response.json();
        if (cancelled) return;

        const serverSettings: unknown =
          typeof data === "object" && data !== null && "settings" in data
            ? data.settings
            : null;

        if (serverSettings !== null && serverSettings !== undefined) {
          // Server wins: apply, and record the resulting local snapshot as
          // in-sync so the subscriptions don't push it straight back.
          applyingRef.current = true;
          try {
            applySyncedSettings(serverSettings);
          } finally {
            applyingRef.current = false;
          }
          lastSyncedRef.current = JSON.stringify(collectSyncedSettings());
        } else {
          // First login on this account: seed the server from local state.
          await push();
        }
      } catch (error) {
        console.error("[settings-sync] Initial reconcile failed:", error);
      }

      if (cancelled) return;

      // Subscribe only after reconcile so the initial apply/seed can't race
      // a debounced push.
      unsubscribers.push(
        useSettingsStore.subscribe(schedulePush),
        useAIStore.subscribe(schedulePush),
        useMediaStore.subscribe(schedulePush),
        useAnkiStore.subscribe(schedulePush),
      );
    };

    void reconcile();

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      lastSyncedRef.current = null;
    };
  }, [userId]);
}
