"use client";

import { useState } from "react";
import { Download, Check, X, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnkiStore } from "@/stores/ankiStore";
import { useAnkiQueueStore } from "@/stores/ankiQueueStore";
import { useAnkiExport } from "@/hooks/useAnkiExport";
import { useAuth } from "@/hooks/useAuth";
import { flushPendingCards } from "@/lib/anki";
import { ApiResponse, ExportContext } from "@/lib/types";

interface AnkiExportButtonProps {
  context: ExportContext;
  className?: string;
}

export function AnkiExportButton({
  context,
  className,
}: AnkiExportButtonProps) {
  const { enabled, reachable, deck, noteType, fieldMappings } = useAnkiStore();
  const enqueueLocal = useAnkiQueueStore((state) => state.enqueueLocal);
  const { exportToAnki } = useAnkiExport();
  const { user } = useAuth();
  const [exportStatus, setExportStatus] = useState<
    "idle" | "pending" | "success" | "queued" | "error"
  >("idle");

  // The button only needs the integration enabled — when Anki isn't
  // reachable (or setup isn't finished) exports queue instead of hiding
  if (!enabled) {
    return null;
  }

  const isConfigured =
    deck && noteType && fieldMappings.some((m) => m.deepDictField !== "none");
  const canExportDirectly = reachable && isConfigured;

  const queueCard = async (): Promise<void> => {
    if (user) {
      const response = await fetch("/api/anki-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const body: ApiResponse<{ enqueued: boolean }> = await response
        .json()
        .catch(() => ({ success: false }));
      if (!response.ok || !body.success) {
        throw new Error(body.error || `HTTP ${response.status}`);
      }
    } else {
      const result = await enqueueLocal(context);
      if (!result.queued && result.reason === "full") {
        throw new Error("Local Anki queue is full (500 cards)");
      }
      // Duplicates count as queued — the card is already waiting
    }
  };

  // Exports queue up, so only this button's own export shows progress —
  // the rest of the app stays fully usable
  const handleExport = async () => {
    setExportStatus("pending");
    try {
      if (canExportDirectly) {
        await exportToAnki(context);
        setExportStatus("success");
        setTimeout(() => setExportStatus("idle"), 2000);
      } else {
        await queueCard();
        setExportStatus("queued");
        setTimeout(() => setExportStatus("idle"), 2000);
        // Rare race: Anki became reachable while the card was queued
        if (useAnkiStore.getState().reachable) {
          void flushPendingCards({ loggedIn: Boolean(user) });
        }
      }
    } catch (error) {
      console.error("Export failed:", error);
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  };

  const getButtonContent = () => {
    switch (exportStatus) {
      case "pending":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "success":
        return <Check className="h-4 w-4 text-green-600" />;
      case "queued":
        return <Clock className="h-4 w-4 text-amber-600" />;
      case "error":
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return canExportDirectly ? (
          <Download className="h-4 w-4" />
        ) : (
          <Clock className="h-4 w-4" />
        );
    }
  };

  const getButtonTitle = () => {
    switch (exportStatus) {
      case "pending":
        return canExportDirectly
          ? "Exporting (queued if another export is running)..."
          : "Queueing card...";
      case "success":
        return "Exported to Anki successfully!";
      case "queued":
        return "Card queued — it will export when Anki is available";
      case "error":
        return canExportDirectly
          ? "Export failed. Check Anki connection."
          : "Could not queue card.";
      default:
        return canExportDirectly
          ? "Export to Anki"
          : "Queue for Anki (exports when Anki is available)";
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleExport}
      disabled={exportStatus === "pending"}
      title={getButtonTitle()}
      className={`h-8 w-8 p-0 hover:bg-muted ${className}`}
    >
      {getButtonContent()}
    </Button>
  );
}
