'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguageStore } from '@/stores/languageStore';
import { ManagedLanguage } from '@/lib/types';

interface LanguageSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: 'source' | 'target';
  disabled?: boolean;
}

export function LanguageSelector({ 
  label, 
  value, 
  onChange, 
  type, 
  disabled = false 
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  
  const {
    getVisibleSourceLanguages,
    getVisibleTargetLanguages,
    initializeFromDatabase,
  } = useLanguageStore();

  // Handle hydration
  useEffect(() => {
    setIsHydrated(true);
    initializeFromDatabase();
  }, [initializeFromDatabase]);

  // Get available languages based on type - only after hydration
  const availableLanguages: ManagedLanguage[] = isHydrated ? (
    type === 'source' 
      ? getVisibleSourceLanguages()
      : getVisibleTargetLanguages()
  ) : [];

  // Find the display name for the current value
  const currentLanguage = availableLanguages.find(
    lang => lang.standardizedName === value
  );
  const displayValue = currentLanguage?.displayName || value;

  const handleSelect = (selectedLanguage: ManagedLanguage) => {
    onChange(selectedLanguage.standardizedName);
    setIsOpen(false);
  };

  // Show loading state during hydration or when no languages are available
  if (!isHydrated || availableLanguages.length === 0) {
    return (
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          disabled={true}
          className="justify-between min-w-[120px]"
        >
          <span className="text-xs text-muted-foreground mr-1">{label}:</span>
          <span className="font-medium">
            {!isHydrated ? "Loading..." : value}
          </span>
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="justify-between min-w-[120px]"
      >
        <span className="text-xs text-muted-foreground mr-1">{label}:</span>
        <span className="font-medium truncate max-w-[80px]" title={displayValue}>
          {displayValue}
        </span>
        <ChevronDown className="h-3 w-3 ml-1" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <Card className="absolute top-full left-0 mt-1 z-20 min-w-[200px] max-h-60 overflow-y-auto">
            <CardContent className="p-2">
              {availableLanguages.map((language) => (
                <button
                  key={language.standardizedName}
                  onClick={() => handleSelect(language)}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{language.displayName}</div>
                    {language.displayName !== language.standardizedName && (
                      <div className="text-xs text-muted-foreground">
                        {language.standardizedName}
                      </div>
                    )}
                  </div>
                  {value === language.standardizedName && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}