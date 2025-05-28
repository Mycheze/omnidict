'use client';

import { Check, X, AlertTriangle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnkiConnectionStatus } from '@/lib/types';

interface AnkiConnectionTestProps {
  status: AnkiConnectionStatus;
  isConnecting: boolean;
  onShowInstructions: () => void;
}

export function AnkiConnectionTest({ status, isConnecting, onShowInstructions }: AnkiConnectionTestProps) {
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
        </span>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center space-x-2 text-red-600">
          <X className="h-4 w-4" />
          <span className="text-sm">Connection failed</span>
        </div>
        <p className="text-sm text-red-700 bg-red-50 p-2 rounded border">
          {status.error}
        </p>
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
    </div>
  );
}