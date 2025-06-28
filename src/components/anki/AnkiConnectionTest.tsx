'use client';

import { Check, X, AlertTriangle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnkiConnectionStatus } from '@/lib/types';
import { AnkiConnect } from '@/lib/anki/ankiConnect';

interface AnkiConnectionTestProps {
  status: AnkiConnectionStatus;
  isConnecting: boolean;
  onShowInstructions: () => void;
}

export function AnkiConnectionTest({ status, isConnecting, onShowInstructions }: AnkiConnectionTestProps) {
  const isHosted = typeof window !== 'undefined' && 
                  window.location.hostname !== 'localhost' && 
                  window.location.hostname !== '127.0.0.1';

  if (isConnecting) {
    return (
      <div className="flex items-center space-x-2 text-blue-600">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
        <span className="text-sm">Testing connection...</span>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="flex items-center space-x-2 text-green-600">
        <Check className="h-4 w-4" />
        <span className="text-sm">
          Connected to AnkiConnect {status.version && `(v${status.version})`}
          {isHosted && <span className="text-xs text-green-700 block">Using direct connection</span>}
        </span>
      </div>
    );
  }

  if (status.error) {
    const getErrorMessage = () => {
      if (status.error?.includes('DIRECT_CONNECTION_FAILED')) {
        return isHosted 
          ? 'Direct connection failed. Check CORS configuration and ensure Anki is running.'
          : 'Connection failed. Make sure Anki is running and AnkiConnect is installed.';
      }
      return status.error;
    };

    const getErrorType = () => {
      if (status.error?.includes('CORS') || status.error?.includes('DIRECT_CONNECTION_FAILED')) {
        return isHosted ? 'CORS configuration needed' : 'Connection failed';
      }
      return 'Connection failed';
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-red-600">
          <X className="h-4 w-4" />
          <span className="text-sm">{getErrorType()}</span>
        </div>
        <p className="text-sm text-red-700 bg-red-50 p-2 rounded border">
          {getErrorMessage()}
        </p>
        {isHosted && status.error?.includes('DIRECT_CONNECTION_FAILED') && (
          <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
            <p className="text-sm text-yellow-800 font-medium">Hosted Environment Detected</p>
            <p className="text-xs text-yellow-700 mt-1">
              You're using the web version. CORS configuration is required for AnkiConnect.
              Click "Show Setup Instructions" below for detailed configuration steps.
            </p>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onShowInstructions}
        >
          <HelpCircle className="h-4 w-4 mr-2" />
          Show Setup Instructions
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 text-gray-600">
      <AlertTriangle className="h-4 w-4" />
      <span className="text-sm">Not tested yet</span>
      {isHosted && (
        <span className="text-xs text-blue-600 block">Hosted environment - CORS required</span>
      )}
    </div>
  );
}