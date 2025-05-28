'use client';

import { useState, useEffect } from 'react';
import { Check, X, ExternalLink, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAnkiStore } from '@/stores/ankiStore';
import { AnkiConnect } from '@/lib/anki/ankiConnect';
import { AnkiConnectionTest } from './AnkiConnectionTest';
import { AnkiDeckSelector } from './AnkiDeckSelector';
import { AnkiNoteTypeSelector } from './AnkiNoteTypeSelector';
import { AnkiFieldMapper } from './AnkiFieldMapper';

export function AnkiSettings() {
  const {
    enabled,
    connected,
    deck,
    noteType,
    fieldMappings,
    connectionStatus,
    isConnecting,
    setEnabled,
    setConnected,
    setConnectionStatus,
    setIsConnecting,
    setAvailableDecks,
    setAvailableNoteTypes,
  } = useAnkiStore();

  const [showInstructions, setShowInstructions] = useState(false);
  const ankiConnect = new AnkiConnect(); // Uses default proxy endpoint

  // Auto-connect on component mount if enabled
  useEffect(() => {
    if (enabled && !connected) {
      handleTestConnection();
    }
  }, [enabled]);

  const handleTestConnection = async () => {
    setIsConnecting(true);
    try {
      const status = await ankiConnect.testConnection();
      setConnectionStatus(status);
      setConnected(status.connected);

      if (status.connected) {
        // Fetch available decks and note types
        const [decks, noteTypes] = await Promise.all([
          ankiConnect.getDecks(),
          ankiConnect.getNoteTypes(),
        ]);
        
        setAvailableDecks(decks);
        setAvailableNoteTypes(noteTypes);
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus({
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleToggleEnabled = async (newEnabled: boolean) => {
    setEnabled(newEnabled);
    
    if (newEnabled && !connected) {
      await handleTestConnection();
    }
  };

  const isConfigurationComplete = () => {
    return connected && deck && noteType && fieldMappings.some(m => m.deepDictField !== 'none');
  };

  return (
    <div className="space-y-6">
      {/* Header and Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Anki Integration</h2>
          <p className="text-muted-foreground">
            Export dictionary entries directly to your Anki decks
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            onClick={() => handleToggleEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
              enabled ? 'bg-primary' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <div className="space-y-4">
          {/* Connection Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>Connection</span>
                {connected && <Check className="h-5 w-5 text-green-500" />}
                {!connected && connectionStatus.error && <X className="h-5 w-5 text-red-500" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Connection Test Button */}
              <div className="flex space-x-2">
                <Button
                  onClick={handleTestConnection}
                  disabled={isConnecting}
                  variant="outline"
                >
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isConnecting ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>

              {/* Connection Status */}
              <AnkiConnectionTest 
                status={connectionStatus}
                isConnecting={isConnecting}
                onShowInstructions={() => setShowInstructions(!showInstructions)}
              />

              {/* Setup Instructions */}
              {showInstructions && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4 text-blue-600" />
                        <span>Setup Instructions</span>
                      </h4>
                      
                      {AnkiConnect.getSetupInstructions().instructions.map((instruction, index) => (
                        <p key={index} className="text-sm text-blue-800">
                          {instruction}
                        </p>
                      ))}
                      
                      <div className="flex items-center space-x-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(AnkiConnect.getSetupInstructions().downloadUrl, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Download AnkiConnect
                        </Button>
                      </div>

                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-medium text-blue-800">
                          Troubleshooting Help
                        </summary>
                        <pre className="mt-2 text-xs bg-white p-3 rounded border overflow-x-auto whitespace-pre-wrap">
                          {AnkiConnect.getCorsConfigHelp()}
                        </pre>
                      </details>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Configuration Section - Only show if connected */}
          {connected && (
            <div className="space-y-4">
              <AnkiDeckSelector />
              <AnkiNoteTypeSelector />
              {noteType && <AnkiFieldMapper />}
              
              {/* Configuration Status */}
              <Card className={isConfigurationComplete() ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}>
                <CardContent className="pt-6">
                  <div className="flex items-center space-x-2">
                    {isConfigurationComplete() ? (
                      <>
                        <Check className="h-5 w-5 text-green-600" />
                        <span className="text-green-800 font-medium">
                          Anki integration is ready! Export buttons will appear on example sentences.
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 text-orange-600" />
                        <span className="text-orange-800">
                          Please complete the configuration above to enable exporting.
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {!enabled && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>Enable Anki integration to start exporting dictionary entries to your Anki decks.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}