'use client';

import { useState } from 'react';
import { RefreshCw, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnkiStore } from '@/stores/ankiStore';
import { useAnkiExport } from '@/hooks/useAnkiExport';
import { ExportContext } from '@/lib/types';

interface AnkiUpdateButtonProps {
  context: ExportContext;
  className?: string;
}

export function AnkiUpdateButton({ context, className }: AnkiUpdateButtonProps) {
  const { enabled, connected, deck, noteType, fieldMappings } = useAnkiStore();
  const { updateLastAnkiCard, isExporting } = useAnkiExport();
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const isConfigured = enabled && connected && deck && noteType && 
                      fieldMappings.some(m => m.deepDictField !== 'none');

  if (!isConfigured) {
    return null;
  }

  const handleUpdate = async () => {
    try {
      await updateLastAnkiCard(context);
      setUpdateStatus('success');
      setTimeout(() => setUpdateStatus('idle'), 2000);
    } catch (error) {
      console.error('Update failed:', error);
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    }
  };

  const getButtonContent = () => {
    if (isExporting) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    
    switch (updateStatus) {
      case 'success':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'error':
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return <RefreshCw className="h-4 w-4" />;
    }
  };

  const getButtonTitle = () => {
    switch (updateStatus) {
      case 'success':
        return 'Updated last Anki card successfully!';
      case 'error':
        return 'Update failed. Check Anki connection.';
      default:
        return 'Update last Anki card';
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleUpdate}
      disabled={isExporting}
      title={getButtonTitle()}
      className={`h-8 w-8 p-0 hover:bg-muted ${className}`}
    >
      {getButtonContent()}
    </Button>
  );
}