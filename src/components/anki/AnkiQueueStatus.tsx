"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  ChevronDown,
  Loader2,
  Send,
  X,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnkiStore } from "@/stores/ankiStore";
import { useAnkiQueueStore } from "@/stores/ankiQueueStore";
import { useMediaStore } from "@/stores/mediaStore";
import { useAuth } from "@/hooks/useAuth";
import { flushPendingCards } from "@/lib/anki";
import { ApiResponse, ExportContext, PendingAnkiCardRow } from "@/lib/types";

/**
 * Floating widget (bottom-left, mirroring ApiQueueStatus on the right) that
 * shows Anki cards waiting to be exported: the server queue for logged-in
 * users plus this device's local queue. Offers per-card removal and a
 * manual "Flush now" when Anki is reachable.
 */

interface QueueItemView {
  key: string;
  headword: string;
  status: string;
  error?: string;
  onRemove?: () => void;
}

function headwordFromContextJson(json: string): string {
  try {
    const value: unknown = JSON.parse(json);
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as ExportContext).headword === "string"
    ) {
      return (value as ExportContext).headword;
    }
  } catch {
    // fall through
  }
  return "(unknown)";
}

function statusColor(status: string): string {
  switch (status) {
    case "error":
      return "text-red-500";
    case "flushing":
      return "text-blue-500";
    case "done":
      return "text-green-600";
    default:
      return "text-muted-foreground";
  }
}

export function AnkiQueueStatus() {
  const enabled = useAnkiStore((state) => state.enabled);
  const reachable = useAnkiStore((state) => state.reachable);
  const localQueue = useAnkiQueueStore((state) => state.localQueue);
  const serverPending = useAnkiQueueStore((state) => state.serverPending);
  const setServerPending = useAnkiQueueStore((state) => state.setServerPending);
  const removeLocal = useAnkiQueueStore((state) => state.removeLocal);
  const isFlushing = useAnkiQueueStore((state) => state.isFlushing);
  const lastFlushResult = useAnkiQueueStore((state) => state.lastFlushResult);
  const enabledTypes = useMediaStore((state) => state.enabledTypes);
  const apiKeys = useMediaStore((state) => state.apiKeys);
  const { user } = useAuth();

  const [expanded, setExpanded] = useState(false);

  const refreshServerPending = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/anki-queue");
      if (!response.ok) return;
      const body: ApiResponse<PendingAnkiCardRow[]> = await response.json();
      if (body.success && body.data) {
        setServerPending(body.data);
      }
    } catch {
      // Widget refresh is best-effort
    }
  }, [user, setServerPending]);

  // Load the server queue once the user is known (and clear it on logout)
  useEffect(() => {
    if (user) {
      refreshServerPending();
    } else {
      setServerPending([]);
    }
  }, [user, refreshServerPending, setServerPending]);

  const removeServerCard = async (id: number) => {
    try {
      const response = await fetch("/api/anki-queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (response.ok) {
        await refreshServerPending();
      }
    } catch {
      // Leave the row visible if the delete failed
    }
  };

  const localPending = localQueue.filter((card) => card.status !== "done");
  const pendingCount = serverPending.length + localPending.length;

  if (!enabled || pendingCount === 0) {
    return null;
  }

  const items: QueueItemView[] = [
    ...serverPending.map((row) => ({
      key: `server-${row.id}`,
      headword: headwordFromContextJson(row.context_json),
      status: row.status,
      error: row.error ?? undefined,
      onRemove:
        row.status !== "flushing"
          ? () => void removeServerCard(row.id)
          : undefined,
    })),
    ...localPending.map((card) => ({
      key: `local-${card.id}`,
      headword: card.context.headword,
      status: card.status,
      error: card.error,
      onRemove: () => removeLocal(card.id),
    })),
  ];

  // Media that costs money is generated with keys stored on this device —
  // warn when queued cards would flush here without them
  const missingMediaKeys =
    (enabledTypes.image && !apiKeys.replicate) ||
    (enabledTypes.sentenceAudio && !apiKeys.elevenLabs);

  const handleFlushNow = () => {
    void flushPendingCards({ loggedIn: Boolean(user) }).then(() => {
      void refreshServerPending();
    });
  };

  if (!expanded) {
    return (
      <div
        className="fixed bottom-4 left-4 z-50 cursor-pointer"
        onClick={() => setExpanded(true)}
        title={`${pendingCount} Anki card${pendingCount === 1 ? "" : "s"} waiting to export`}
      >
        <div className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 shadow-lg transition-all duration-200 hover:scale-105">
          {isFlushing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-white" />
          )}
          <span className="text-xs font-bold text-white">{pendingCount}</span>
        </div>
      </div>
    );
  }

  return (
    <Card className="fixed bottom-4 left-4 z-50 w-80 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <span>Anki Queue</span>
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium">
              {pendingCount}
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            className="h-6 w-6 p-0"
            title="Collapse"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-2">
        <p className="text-xs text-muted-foreground">
          These cards will export automatically when a device with Anki running
          connects.
        </p>

        {missingMediaKeys && (
          <p className="text-xs text-amber-600 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Media generation needs API keys on the device that flushes
              (Settings → Media Generation) — cards without them export without
              media.
            </span>
          </p>
        )}

        <div className="space-y-1 max-h-40 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-2 py-1 text-sm"
            >
              {item.status === "error" ? (
                <XCircle className="h-3 w-3 text-red-500 shrink-0" />
              ) : item.status === "flushing" ? (
                <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
              ) : (
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 truncate">
                {item.headword}
                {item.error && (
                  <span className={`text-xs ml-1 ${statusColor(item.status)}`}>
                    - {item.error}
                  </span>
                )}
              </span>
              {item.onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={item.onRemove}
                  className="h-5 w-5 p-0 shrink-0"
                  title="Remove from queue"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleFlushNow}
            disabled={!reachable || isFlushing}
            title={
              reachable
                ? "Export all pending cards now"
                : "Anki is not reachable from this device"
            }
          >
            {isFlushing ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Send className="h-3 w-3 mr-1" />
            )}
            {isFlushing ? "Flushing..." : "Flush now"}
          </Button>
          {lastFlushResult && lastFlushResult.status === "completed" && (
            <span className="text-xs text-muted-foreground">
              Last flush: {lastFlushResult.exported} exported
              {lastFlushResult.failed > 0 &&
                `, ${lastFlushResult.failed} failed`}
            </span>
          )}
          {lastFlushResult && lastFlushResult.status === "not-configured" && (
            <span className="text-xs text-amber-600">
              Finish Anki setup in Settings
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
