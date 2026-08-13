"use client";

import { useState, useEffect } from "react";
import { Bot, Check, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useAIStore } from "@/stores/aiStore";
import {
  PROVIDER_METADATA,
  AIProviderType,
  ModelInfo,
} from "@/lib/ai/providers/metadata";

export function AIModelSettings() {
  const {
    selectedProvider,
    apiKeys,
    selectedModels,
    lastTestResults,
    setSelectedProvider,
    setApiKey,
    setSelectedModel,
    setTestResult,
  } = useAIStore();

  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const providerMetadata = PROVIDER_METADATA[selectedProvider];
  const requiresApiKey = providerMetadata?.requiresApiKey;
  const currentApiKey = apiKeys[selectedProvider] || "";
  const availableModels: ModelInfo[] = providerMetadata?.models || [];
  const storedModel = selectedModels[selectedProvider];
  // A persisted model the registry no longer knows falls back to the default
  const currentModel =
    storedModel && availableModels.some((m) => m.id === storedModel)
      ? storedModel
      : providerMetadata?.defaultModel || "";
  const lastTest = lastTestResults[selectedProvider];

  // Load API key into input when provider changes
  useEffect(() => {
    setApiKeyInput(currentApiKey);
    setShowApiKey(false);
  }, [selectedProvider, currentApiKey]);

  // Heal the store when the persisted model is absent or stale
  useEffect(() => {
    if (currentModel && storedModel !== currentModel) {
      setSelectedModel(selectedProvider, currentModel);
    }
  }, [selectedProvider, storedModel, currentModel, setSelectedModel]);

  const handleProviderChange = (provider: AIProviderType) => {
    setSelectedProvider(provider);
  };

  const handleApiKeyChange = (value: string) => {
    setApiKeyInput(value);
    // Auto-save API key
    setApiKey(selectedProvider, value);
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(selectedProvider, model);
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerType: selectedProvider,
          apiKey: requiresApiKey ? apiKeyInput : undefined,
          model: currentModel,
        }),
      });

      const result = await response.json();
      setTestResult(selectedProvider, {
        success: result.success,
        message: result.message || result.error,
      });
    } catch (error) {
      setTestResult(selectedProvider, {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Bot className="h-6 w-6" />
          AI Model Selection
        </h2>
        <p className="text-muted-foreground mt-1">
          Choose which AI model to use for generating dictionary entries
        </p>
      </div>

      {/* Provider Selector */}
      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>Select your preferred AI service</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.values(PROVIDER_METADATA).map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleProviderChange(provider.id)}
                className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                  selectedProvider === provider.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium">{provider.name}</div>
                {!provider.requiresApiKey && (
                  <div className="text-xs text-green-600 mt-1">Free</div>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>{providerMetadata?.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Key Input */}
          {requiresApiKey && (
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={`Enter your ${providerMetadata.name} API key`}
                  className="w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your API key is stored only in this browser and is used
                server-side solely to relay your requests to{" "}
                {providerMetadata.name} — it is never saved on our servers
              </p>
            </div>
          )}

          {/* Model Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <select
              value={currentModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                  {model.description && ` - ${model.description}`}
                </option>
              ))}
            </select>
          </div>

          {/* Test Button */}
          <div className="pt-2">
            <Button
              onClick={handleTest}
              disabled={isTesting || (requiresApiKey && !apiKeyInput)}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>
          </div>

          {/* Test Result */}
          {lastTest && (
            <div
              className={`p-3 rounded-md flex items-start gap-2 ${
                lastTest.success
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {lastTest.success ? (
                <Check className="h-5 w-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-medium">
                  {lastTest.success
                    ? "Connection successful"
                    : "Connection failed"}
                </div>
                {lastTest.message && (
                  <div className="text-sm mt-1">{lastTest.message}</div>
                )}
                <div className="text-xs mt-1 opacity-70">
                  {new Date(lastTest.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="text-sm text-blue-800 space-y-2">
            <p className="font-medium">💡 How it works:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>
                Select an AI provider and configure your API key (except
                DeepSeek)
              </li>
              <li>Choose your preferred model from the dropdown</li>
              <li>
                Click &quot;Test Connection&quot; to verify everything works
              </li>
              <li>
                All new dictionary entries will be generated using your selected
                model
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
