'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Eye, EyeOff, Edit2, Trash2, RefreshCw, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguageStore } from '@/stores/languageStore';
import { ManagedLanguage } from '@/lib/types';

// Extract LanguageList as a separate component to prevent recreation
const LanguageList = ({ 
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
  editInputRef
}: { 
  title: string; 
  languages: ManagedLanguage[]; 
  type: 'source' | 'target';
  onAddLanguage: (type: 'source' | 'target') => void;
  onStartEdit: (type: 'source' | 'target', standardizedName: string, displayName: string) => void;
  onToggleVisibility: (type: 'source' | 'target', standardizedName: string) => void;
  onRemoveCustom: (type: 'source' | 'target', standardizedName: string) => void;
  addingToType: 'source' | 'target' | null;
  newLanguageInput: string;
  setNewLanguageInput: (value: string) => void;
  validatingLanguage: boolean;
  editingLanguage: { type: 'source' | 'target'; standardizedName: string; displayName: string; } | null;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
}) => {
  const addInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus add input when it appears
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
        {/* Add new language input */}
        {addingToType === type && (
          <div className="flex space-x-2 p-3 bg-muted rounded-lg">
            <Input
              ref={addInputRef}
              value={newLanguageInput}
              onChange={(e) => setNewLanguageInput(e.target.value)}
              placeholder="Enter language name (e.g., 'español', 'français', 'jp')"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
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
            <Button
              variant="outline"
              onClick={() => {
                setNewLanguageInput('');
                onAddLanguage(null as any); // Cancel by setting to null
              }}
              size="sm"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Language list */}
        <div className="space-y-2">
          {languages.map((language) => {
            const isEditing = editingLanguage?.standardizedName === language.standardizedName &&
                             editingLanguage?.type === type;
            
            return (
              <div
                key={language.standardizedName}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  language.visible ? 'bg-background' : 'bg-muted opacity-60'
                }`}
              >
                <div className="flex-1">
                  {isEditing ? (
                    <div className="flex space-x-2">
                      <Input
                        ref={editInputRef}
                        value={editingLanguage.displayName}
                        onChange={(e) => onEditChange(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onSaveEdit();
                          } else if (e.key === 'Escape') {
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
                        {language.isCustom ? 'Custom' : 'From database'}
                      </div>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onStartEdit(type, language.standardizedName, language.displayName)}
                      title="Edit display name"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleVisibility(type, language.standardizedName)}
                      title={language.visible ? 'Hide from dropdowns' : 'Show in dropdowns'}
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
};

export function LanguageManagement() {
  // Stable store selectors to prevent re-renders
  const sourceLanguages = useLanguageStore(state => state.sourceLanguages);
  const targetLanguages = useLanguageStore(state => state.targetLanguages);
  const isLoading = useLanguageStore(state => state.isLoading);
  const error = useLanguageStore(state => state.error);
  
  // Store actions - these are stable
  const addLanguage = useLanguageStore(state => state.addLanguage);
  const updateLanguage = useLanguageStore(state => state.updateLanguage);
  const toggleLanguageVisibility = useLanguageStore(state => state.toggleLanguageVisibility);
  const removeCustomLanguage = useLanguageStore(state => state.removeCustomLanguage);
  const syncWithDatabase = useLanguageStore(state => state.syncWithDatabase);
  const initializeFromDatabase = useLanguageStore(state => state.initializeFromDatabase);
  const setError = useLanguageStore(state => state.setError);

  // Local state
  const [newLanguageInput, setNewLanguageInput] = useState('');
  const [addingToType, setAddingToType] = useState<'source' | 'target' | null>(null);
  const [validatingLanguage, setValidatingLanguage] = useState(false);
  const [editingLanguage, setEditingLanguage] = useState<{
    type: 'source' | 'target';
    standardizedName: string;
    displayName: string;
  } | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);

  // Initialize from database on mount
  useEffect(() => {
    initializeFromDatabase();
  }, [initializeFromDatabase]);

  // Auto-focus edit input when editing starts
  useEffect(() => {
    if (editingLanguage && editInputRef.current) {
      // Use setTimeout to ensure the input is rendered
      setTimeout(() => {
        editInputRef.current?.focus();
      }, 0);
    }
  }, [editingLanguage]);

  // Stable callback for adding language
  const handleAddLanguage = useCallback(async (type: 'source' | 'target' | null) => {
    if (type === null) {
      setAddingToType(null);
      setNewLanguageInput('');
      return;
    }

    if (addingToType !== type) {
      setAddingToType(type);
      return;
    }

    if (!newLanguageInput.trim()) return;

    setValidatingLanguage(true);
    setError(null);

    try {
      const response = await fetch('/api/languages/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputLanguage: newLanguageInput.trim() }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to validate language');
      }

      const { standardizedName, displayName } = result.data;

      const newLanguage: ManagedLanguage = {
        standardizedName,
        displayName,
        visible: true,
        isCustom: true,
      };

      addLanguage(type, newLanguage);
      setNewLanguageInput('');
      setAddingToType(null);
      
    } catch (error) {
      console.error('Language validation failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to add language');
    } finally {
      setValidatingLanguage(false);
    }
  }, [addingToType, newLanguageInput, addLanguage, setError]);

  // Stable callback for starting edit
  const handleStartEdit = useCallback((
    type: 'source' | 'target',
    standardizedName: string,
    currentDisplayName: string
  ) => {
    setEditingLanguage({
      type,
      standardizedName,
      displayName: currentDisplayName
    });
  }, []);

  // Stable callback for edit change
  const handleEditChange = useCallback((newDisplayName: string) => {
    setEditingLanguage(prev => prev ? {
      ...prev,
      displayName: newDisplayName
    } : null);
  }, []);

  // Stable callback for save edit
  const handleSaveEdit = useCallback(() => {
    if (editingLanguage && editingLanguage.displayName.trim()) {
      updateLanguage(
        editingLanguage.type, 
        editingLanguage.standardizedName, 
        { displayName: editingLanguage.displayName.trim() }
      );
    }
    setEditingLanguage(null);
  }, [editingLanguage, updateLanguage]);

  // Stable callback for cancel edit
  const handleCancelEdit = useCallback(() => {
    setEditingLanguage(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Error Display */}
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

      {/* Language Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LanguageList 
          title="Source Languages" 
          languages={sourceLanguages} 
          type="source"
          onAddLanguage={handleAddLanguage}
          onStartEdit={handleStartEdit}
          onToggleVisibility={toggleLanguageVisibility}
          onRemoveCustom={removeCustomLanguage}
          addingToType={addingToType}
          newLanguageInput={newLanguageInput}
          setNewLanguageInput={setNewLanguageInput}
          validatingLanguage={validatingLanguage}
          editingLanguage={editingLanguage}
          onEditChange={handleEditChange}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          editInputRef={editInputRef}
        />
        <LanguageList 
          title="Target Languages" 
          languages={targetLanguages} 
          type="target"
          onAddLanguage={handleAddLanguage}
          onStartEdit={handleStartEdit}
          onToggleVisibility={toggleLanguageVisibility}
          onRemoveCustom={removeCustomLanguage}
          addingToType={addingToType}
          newLanguageInput={newLanguageInput}
          setNewLanguageInput={setNewLanguageInput}
          validatingLanguage={validatingLanguage}
          editingLanguage={editingLanguage}
          onEditChange={handleEditChange}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          editInputRef={editInputRef}
        />
      </div>

      {/* Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>How it works:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Add languages in any language - AI will standardize them</li>
              <li>Edit display names to show languages as you prefer</li>
              <li>Hide languages from dropdowns without deleting them</li>
              <li>Database languages are preserved and can't be deleted</li>
              <li>Changes sync across all your dictionary interfaces</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}