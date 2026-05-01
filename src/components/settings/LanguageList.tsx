"use client";

import { useEffect, useRef } from "react";
import {
  Plus,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManagedLanguage } from "@/lib/types";

interface LanguageListProps {
  title: string;
  languages: ManagedLanguage[];
  type: "source" | "target";
  onAddLanguage: (type: "source" | "target") => void;
  onStartEdit: (
    type: "source" | "target",
    standardizedName: string,
    displayName: string,
  ) => void;
  onToggleVisibility: (
    type: "source" | "target",
    standardizedName: string,
  ) => void;
  onRemoveCustom: (type: "source" | "target", standardizedName: string) => void;
  addingToType: "source" | "target" | null;
  newLanguageInput: string;
  setNewLanguageInput: (value: string) => void;
  validatingLanguage: boolean;
  editingLanguage: {
    type: "source" | "target";
    standardizedName: string;
    displayName: string;
  } | null;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onCancelAdd: () => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}

function LanguageItem({
  language,
  type,
  isEditing,
  editingLanguage,
  editInputRef,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onToggleVisibility,
  onRemoveCustom,
}: {
  language: ManagedLanguage;
  type: "source" | "target";
  isEditing: boolean;
  editingLanguage: LanguageListProps["editingLanguage"];
  editInputRef: React.RefObject<HTMLInputElement | null>;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: (
    type: "source" | "target",
    standardizedName: string,
    displayName: string,
  ) => void;
  onToggleVisibility: (
    type: "source" | "target",
    standardizedName: string,
  ) => void;
  onRemoveCustom: (type: "source" | "target", standardizedName: string) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border ${
        language.visible ? "bg-background" : "bg-muted opacity-60"
      }`}
    >
      <div className="flex-1">
        {isEditing && editingLanguage ? (
          <div className="flex space-x-2">
            <Input
              ref={editInputRef}
              value={editingLanguage.displayName}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onCancelEdit();
                }
              }}
              className="flex-1"
              autoFocus
            />
            <Button size="sm" onClick={onSaveEdit}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="sm" onClick={onCancelEdit}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <div>
            <div className="font-medium">{language.displayName}</div>
            {language.displayName !== language.standardizedName && (
              <div className="text-sm text-muted-foreground">
                Standard: {language.standardizedName}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {language.isCustom ? "Custom" : "From database"}
            </div>
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onStartEdit(type, language.standardizedName, language.displayName)
            }
            title="Edit display name"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleVisibility(type, language.standardizedName)}
            title={
              language.visible ? "Hide from dropdowns" : "Show in dropdowns"
            }
          >
            {language.visible ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>
          {language.isCustom && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemoveCustom(type, language.standardizedName)}
              title="Remove custom language"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function LanguageList({
  title,
  languages,
  type,
  onAddLanguage,
  onStartEdit,
  onToggleVisibility,
  onRemoveCustom,
  addingToType,
  newLanguageInput,
  setNewLanguageInput,
  validatingLanguage,
  editingLanguage,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onCancelAdd,
  editInputRef,
}: LanguageListProps) {
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingToType === type && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [addingToType, type]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddLanguage(type)}
            disabled={validatingLanguage || addingToType === type}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Language
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {addingToType === type && (
          <div className="flex space-x-2 p-3 bg-muted rounded-lg">
            <Input
              ref={addInputRef}
              value={newLanguageInput}
              onChange={(e) => setNewLanguageInput(e.target.value)}
              placeholder="Enter language name (e.g., 'espanol', 'francais', 'jp')"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddLanguage(type);
                }
              }}
              disabled={validatingLanguage}
            />
            <Button
              onClick={() => onAddLanguage(type)}
              disabled={!newLanguageInput.trim() || validatingLanguage}
              size="sm"
            >
              {validatingLanguage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" onClick={onCancelAdd} size="sm">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {languages.map((language) => {
            const isEditing =
              editingLanguage?.standardizedName === language.standardizedName &&
              editingLanguage?.type === type;

            return (
              <LanguageItem
                key={language.standardizedName}
                language={language}
                type={type}
                isEditing={isEditing}
                editingLanguage={editingLanguage}
                editInputRef={editInputRef}
                onEditChange={onEditChange}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onStartEdit={onStartEdit}
                onToggleVisibility={onToggleVisibility}
                onRemoveCustom={onRemoveCustom}
              />
            );
          })}

          {languages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No languages configured. Add some languages to get started.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
