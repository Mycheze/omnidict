import { describe, it, expect, beforeEach } from "vitest";
import { useAIStore } from "./aiStore";

describe("aiStore", () => {
  beforeEach(() => {
    useAIStore.getState().resetSettings();
  });

  it("defaults to deepseek provider", () => {
    expect(useAIStore.getState().selectedProvider).toBe("deepseek");
  });

  it("has default models for all providers", () => {
    const models = useAIStore.getState().selectedModels;
    expect(models.deepseek).toBe("deepseek-v4-flash");
    expect(models.chatgpt).toBe("gpt-4o");
    expect(models.claude).toBe("claude-3-5-sonnet-20241022");
    expect(models.gemini).toBe("gemini-2.5-flash");
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
