import { describe, it, expect, beforeEach } from "vitest";
import { useAIStore } from "./aiStore";
import { PROVIDER_METADATA } from "@/lib/ai/providers/metadata";

describe("aiStore", () => {
  beforeEach(() => {
    useAIStore.getState().resetSettings();
  });

  it("defaults to deepseek provider", () => {
    expect(useAIStore.getState().selectedProvider).toBe("deepseek");
  });

  it("defaults every provider's model to its registry default", () => {
    const models = useAIStore.getState().selectedModels;
    for (const provider of Object.values(PROVIDER_METADATA)) {
      expect(models[provider.id]).toBe(provider.defaultModel);
    }
  });

  it("switches provider", () => {
    useAIStore.getState().setSelectedProvider("claude");
    expect(useAIStore.getState().selectedProvider).toBe("claude");
  });

  it("stores API key per provider", () => {
    useAIStore.getState().setApiKey("chatgpt", "sk-test123");
    expect(useAIStore.getState().apiKeys.chatgpt).toBe("sk-test123");
    expect(useAIStore.getState().apiKeys.claude).toBeUndefined();
  });

  it("clears API key for a provider", () => {
    useAIStore.getState().setApiKey("chatgpt", "sk-test123");
    useAIStore.getState().clearApiKey("chatgpt");
    expect(useAIStore.getState().apiKeys.chatgpt).toBeUndefined();
  });

  it("sets model per provider", () => {
    useAIStore
      .getState()
      .setSelectedModel("claude", "claude-opus-4-5-20251101");
    expect(useAIStore.getState().selectedModels.claude).toBe(
      "claude-opus-4-5-20251101",
    );
  });

  it("does not affect other providers when setting model", () => {
    useAIStore
      .getState()
      .setSelectedModel("claude", "claude-opus-4-5-20251101");
    expect(useAIStore.getState().selectedModels.deepseek).toBe(
      "deepseek-v4-flash",
    );
  });

  it("stores test results with timestamp", () => {
    const before = Date.now();
    useAIStore
      .getState()
      .setTestResult("deepseek", { success: true, message: "OK" });
    const result = useAIStore.getState().lastTestResults.deepseek;
    expect(result).toBeDefined();
    expect(result!.success).toBe(true);
    expect(result!.message).toBe("OK");
    expect(result!.timestamp).toBeGreaterThanOrEqual(before);
  });

  it("resets all settings to defaults", () => {
    useAIStore.getState().setSelectedProvider("claude");
    useAIStore.getState().setApiKey("chatgpt", "key");
    useAIStore.getState().setSelectedModel("claude", "custom-model");
    useAIStore.getState().resetSettings();

    const state = useAIStore.getState();
    expect(state.selectedProvider).toBe("deepseek");
    expect(state.apiKeys).toEqual({});
    expect(state.selectedModels.deepseek).toBe("deepseek-v4-flash");
  });
});

describe("aiStore migrate", () => {
  // Access the migrate function through the persist API
  const migrate = useAIStore.persist.getOptions().migrate!;

  it("returns defaults for corrupt persisted state", () => {
    for (const bad of [null, "garbage", 42, ["array"]]) {
      const result = migrate(bad, 1) as { selectedProvider: string };
      expect(result.selectedProvider).toBe("deepseek");
    }
  });

  it("remaps legacy DeepSeek model names", () => {
    const result = migrate(
      { selectedModels: { deepseek: "deepseek-chat" } },
      1,
    ) as { selectedModels: Record<string, string> };
    expect(result.selectedModels.deepseek).toBe("deepseek-v4-flash");

    const result2 = migrate(
      { selectedModels: { deepseek: "deepseek-reasoner" } },
      1,
    ) as { selectedModels: Record<string, string> };
    expect(result2.selectedModels.deepseek).toBe("deepseek-v4-pro");
  });

  it("resets unknown model ids to the provider default", () => {
    const result = migrate(
      { selectedModels: { chatgpt: "gpt-4-turbo", gemini: "gemini-1.5-pro" } },
      2,
    ) as { selectedModels: Record<string, string> };
    expect(result.selectedModels.chatgpt).toBe(
      PROVIDER_METADATA.chatgpt.defaultModel,
    );
    expect(result.selectedModels.gemini).toBe(
      PROVIDER_METADATA.gemini.defaultModel,
    );
  });

  it("deep-merges selectedModels instead of clobbering defaults", () => {
    const result = migrate(
      { selectedModels: { deepseek: "deepseek-v4-pro" } },
      2,
    ) as { selectedModels: Record<string, string> };
    // Persisted choice preserved
    expect(result.selectedModels.deepseek).toBe("deepseek-v4-pro");
    // Untouched providers keep registry defaults (old code lost these)
    expect(result.selectedModels.chatgpt).toBe(
      PROVIDER_METADATA.chatgpt.defaultModel,
    );
    expect(result.selectedModels.openrouter).toBe(
      PROVIDER_METADATA.openrouter.defaultModel,
    );
  });

  it("resets an invalid selectedProvider to deepseek", () => {
    const result = migrate({ selectedProvider: "gone-provider" }, 2) as {
      selectedProvider: string;
    };
    expect(result.selectedProvider).toBe("deepseek");
  });
});
