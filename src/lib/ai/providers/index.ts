import { ProviderConfig, ModelProvider } from "./ModelProvider";
import { AIProviderType, PROVIDER_METADATA } from "./metadata";
import { DeepSeekProvider } from "./DeepSeekProvider";
import { ChatGPTProvider } from "./ChatGPTProvider";
import { ClaudeProvider } from "./ClaudeProvider";
import { GeminiProvider } from "./GeminiProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";

// Re-export metadata from client-safe file
export * from "./metadata";

/**
 * Factory function to create a provider instance
 * SERVER-SIDE ONLY - Do not import this in client components
 */
export function createProvider(
  providerType: AIProviderType,
  config?: ProviderConfig,
): ModelProvider {
  const meta = PROVIDER_METADATA[providerType];
  if (!meta) {
    throw new Error(`Unknown provider type: ${providerType}`);
  }

  // Metadata-driven key check: a user key satisfies it, and providers with a
  // server env fallback accept that instead. Constructors re-validate.
  const hasEnvKey = meta.envKeyVar ? !!process.env[meta.envKeyVar] : false;
  if (!config?.apiKey && !hasEnvKey) {
    throw new Error(`${meta.name} requires an API key`);
  }

  switch (providerType) {
    case "deepseek":
      return new DeepSeekProvider(config);
    case "chatgpt":
      return new ChatGPTProvider(requireConfig(config, meta.name));
    case "claude":
      return new ClaudeProvider(requireConfig(config, meta.name));
    case "gemini":
      return new GeminiProvider(requireConfig(config, meta.name));
    case "openrouter":
      return new OpenRouterProvider(config);
    default: {
      const exhaustive: never = providerType;
      throw new Error(`Unknown provider type: ${exhaustive}`);
    }
  }
}

function requireConfig(
  config: ProviderConfig | undefined,
  providerName: string,
): ProviderConfig {
  if (!config?.apiKey) {
    throw new Error(`${providerName} requires an API key`);
  }
  return config;
}

// Re-export types and classes (SERVER-SIDE ONLY)
export * from "./ModelProvider";
export { DeepSeekProvider } from "./DeepSeekProvider";
export { ChatGPTProvider } from "./ChatGPTProvider";
export { ClaudeProvider } from "./ClaudeProvider";
export { GeminiProvider } from "./GeminiProvider";
export { OpenRouterProvider } from "./OpenRouterProvider";
