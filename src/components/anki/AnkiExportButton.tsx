"use client";

import { useState } from "react";
import { Download, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnkiStore } from "@/stores/ankiStore";
import { useAnkiExport } from "@/hooks/useAnkiExport";
import { ExportContext } from "@/lib/types";

interface AnkiExportButtonProps {
  context: ExportContext;
  className?: string;
}

export function AnkiExportButton({
  context,
  className,
}: AnkiExportButtonProps) {
  const { enabled, connected, deck, noteType, fieldMappings } = useAnkiStore();
  const { exportToAnki } = useAnkiExport();
  const [exportStatus, setExportStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");

  const isConfigured =
    enabled &&
    connected &&
    deck &&
    noteType &&
    fieldMappings.some((m) => m.deepDictField !== "none");

  if (!isConfigured) {
    return null;
  }

  // Exports queue up, so only this button's own export shows progress —
  // the rest of the app stays fully usable
  const handleExport = async () => {
    setExportStatus("pending");
    try {
      await exportToAnki(context);
      setExportStatus("success");
      setTimeout(() => setExportStatus("idle"), 2000);
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
      case "error":
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return <Download className="h-4 w-4" />;
    }
  };

  const getButtonTitle = () => {
    switch (exportStatus) {
      case "pending":
        return "Exporting (queued if another export is running)...";
      case "success":
        return "Exported to Anki successfully!";
      case "error":
        return "Export failed. Check Anki connection.";
      default:
        return "Export to Anki";
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
