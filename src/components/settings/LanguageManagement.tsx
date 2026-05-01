"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageList } from "@/components/settings/LanguageList";
import { useLanguageStore } from "@/stores/languageStore";
import { ManagedLanguage } from "@/lib/types";

export function LanguageManagement() {
  const sourceLanguages = useLanguageStore((state) => state.sourceLanguages);
  const targetLanguages = useLanguageStore((state) => state.targetLanguages);
  const isLoading = useLanguageStore((state) => state.isLoading);
  const error = useLanguageStore((state) => state.error);

  const addLanguage = useLanguageStore((state) => state.addLanguage);
  const updateLanguage = useLanguageStore((state) => state.updateLanguage);
  const toggleLanguageVisibility = useLanguageStore(
    (state) => state.toggleLanguageVisibility,
  );
  const removeCustomLanguage = useLanguageStore(
    (state) => state.removeCustomLanguage,
  );
  const syncWithDatabase = useLanguageStore((state) => state.syncWithDatabase);
  const initializeFromDatabase = useLanguageStore(
    (state) => state.initializeFromDatabase,
  );
  const setError = useLanguageStore((state) => state.setError);

  const [newLanguageInput, setNewLanguageInput] = useState("");
  const [addingToType, setAddingToType] = useState<"source" | "target" | null>(
    null,
  );
  const [validatingLanguage, setValidatingLanguage] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState<{
    type: "source" | "target";
    standardizedName: string;
    displayName: string;
  } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeFromDatabase();
  }, [initializeFromDatabase]);

  useEffect(() => {
    if (editingLanguage && editInputRef.current) {
      setTimeout(() => {
        editInputRef.current?.focus();
      }, 0);
    }
  }, [editingLanguage]);

  const handleAddLanguage = useCallback(
    async (type: "source" | "target") => {
      if (addingToType !== type) {
        setAddingToType(type);
        return;
      }

      if (!newLanguageInput.trim()) return;

      setValidatingLanguage(true);
      setError(null);

      try {
        const response = await fetch("/api/languages/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputLanguage: newLanguageInput.trim() }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to validate language");
        }

        const { standardizedName, displayName } = result.data;

        const newLanguage: ManagedLanguage = {
          standardizedName,
          displayName,
          visible: true,
          isCustom: true,
        };

        addLanguage(type, newLanguage);
        setNewLanguageInput("");
        setAddingToType(null);
      } catch (err) {
        console.error("Language validation failed:", err);
        setError(err instanceof Error ? err.message : "Failed to add language");
      } finally {
        setValidatingLanguage(false);
      }
    },
    [addingToType, newLanguageInput, addLanguage, setError],
  );

  const handleCancelAdd = useCallback(() => {
    setNewLanguageInput("");
    setAddingToType(null);
  }, []);

  const handleStartEdit = useCallback(
    (
      type: "source" | "target",
      standardizedName: string,
      currentDisplayName: string,
    ) => {
      setEditingLanguage({
        type,
        standardizedName,
        displayName: currentDisplayName,
      });
    },
    [],
  );

  const handleEditChange = useCallback((newDisplayName: string) => {
    setEditingLanguage((prev) =>
      prev ? { ...prev, displayName: newDisplayName } : null,
    );
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingLanguage && editingLanguage.displayName.trim()) {
      updateLanguage(editingLanguage.type, editingLanguage.standardizedName, {
        displayName: editingLanguage.displayName.trim(),
      });
    }
    setEditingLanguage(null);
  }, [editingLanguage, updateLanguage]);

  const handleCancelEdit = useCallback(() => {
    setEditingLanguage(null);
  }, []);

  const sharedListProps = {
    onAddLanguage: handleAddLanguage,
    onStartEdit: handleStartEdit,
    onToggleVisibility: toggleLanguageVisibility,
    onRemoveCustom: removeCustomLanguage,
    addingToType,
    newLanguageInput,
    setNewLanguageInput,
    validatingLanguage,
    editingLanguage,
    onEditChange: handleEditChange,
    onSaveEdit: handleSaveEdit,
    onCancelEdit: handleCancelEdit,
    onCancelAdd: handleCancelAdd,
    editInputRef,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Language Management</h2>
          <p className="text-muted-foreground">
            Manage which languages appear in your dictionary interface
          </p>
        </div>
        <Button
          variant="outline"
          onClick={syncWithDatabase}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync with Database
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setError(null)}
              className="mt-2"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LanguageList
          title="Source Languages"
          languages={sourceLanguages}
          type="source"
          {...sharedListProps}
        />
        <LanguageList
          title="Target Languages"
          languages={targetLanguages}
          type="target"
          {...sharedListProps}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>How it works:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>
                Add languages by name or code (e.g., &quot;French&quot;,
                &quot;ja&quot;)
              </li>
              <li>Edit display names to show languages as you prefer</li>
              <li>Hide languages from dropdowns without deleting them</li>
              <li>
                Database languages are preserved and can&apos;t be deleted
              </li>
              <li>Changes sync across all your dictionary interfaces</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
