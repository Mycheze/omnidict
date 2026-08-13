/**
 * Client-safe types and metadata for AI providers
 * This file contains NO server-side imports and can be safely used in client components
 *
 * This is the single source of truth for provider types, model lists, default
 * models, and per-model behavior flags. Server code (factory, providers) and
 * client code (settings UI, stores) must all derive from it.
 */

export type AIProviderType =
  "deepseek" | "chatgpt" | "claude" | "gemini" | "openrouter";

export const VALID_PROVIDER_TYPES: readonly AIProviderType[] = [
  "deepseek",
  "chatgpt",
  "claude",
  "gemini",
  "openrouter",
];

export function isValidProviderType(value: string): value is AIProviderType {
  return VALID_PROVIDER_TYPES.includes(value as AIProviderType);
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  /**
   * OpenAI-style reasoning model: requires max_completion_tokens instead of
   * max_tokens and rejects non-default temperature values.
   */
  reasoning?: boolean;
}

export interface ProviderMetadata {
  id: AIProviderType;
  name: string;
  description: string;
  /** User must supply an API key in the settings UI */
  requiresApiKey: boolean;
  /**
   * Server env var consulted as a key fallback when no user key is provided.
   * Only meaningful server-side; listed here so the factory and routes can be
   * metadata-driven instead of special-casing providers.
   */
  envKeyVar?: string;
  /** Model used when the user has not picked one */
  defaultModel: string;
  models: ModelInfo[];
}

/**
 * Provider metadata with available models
 * Updated: August 2026 (DeepSeek v4; OpenRouter added as price-hike hedge)
 */
export const PROVIDER_METADATA: Record<AIProviderType, ProviderMetadata> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    description: "Free AI model using system API key",
    requiresApiKey: false,
    envKeyVar: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-flash",
    models: [
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        description: "Fast performance tier (replaces deepseek-chat)",
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description: "Enhanced capabilities model",
      },
    ],
  },
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    description: "OpenAI ChatGPT models",
    requiresApiKey: true,
    defaultModel: "gpt-5-mini",
    models: [
      {
        id: "gpt-5.2",
        name: "GPT-5.2",
        description: "Latest flagship model for coding and agentic tasks",
        reasoning: true,
      },
      {
        id: "gpt-5.1",
        name: "GPT-5.1",
        description: "Flagship model with configurable reasoning effort",
        reasoning: true,
      },
      {
        id: "gpt-5",
        name: "GPT-5",
        description: "Coding, reasoning, and agentic tasks",
        reasoning: true,
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        description: "Faster, cost-efficient GPT-5 variant",
        reasoning: true,
      },
      {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        description: "Fastest, cheapest GPT-5 for simple tasks",
        reasoning: true,
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        description: "Fast multimodal model, good balance of speed and quality",
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "Affordable and fast for lightweight tasks",
      },
      {
        id: "o3",
        name: "O3",
        description: "Advanced reasoning model",
        reasoning: true,
      },
      {
        id: "o4-mini",
        name: "O4 Mini",
        description: "Compact reasoning model",
        reasoning: true,
      },
      {
        id: "o3-mini",
        name: "O3 Mini",
        description: "Fast, affordable reasoning model",
        reasoning: true,
      },
    ],
  },
  claude: {
    id: "claude",
    name: "Claude",
    description: "Anthropic Claude models",
    requiresApiKey: true,
    defaultModel: "claude-haiku-4-5-20250927",
    models: [
      {
        id: "claude-opus-4-5-20251101",
        name: "Claude Opus 4.5",
        description: "Most intelligent for complex tasks",
      },
      {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        description: "Best for coding, balanced speed and cost",
      },
      {
        id: "claude-haiku-4-5-20250927",
        name: "Claude Haiku 4.5",
        description: "Fast, near-frontier performance",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Previous generation intelligent model",
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        description: "Previous generation fast model",
      },
    ],
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    description: "Google Gemini models",
    requiresApiKey: true,
    defaultModel: "gemini-2.5-flash",
    models: [
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Best price-performance, fast and efficient",
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        description: "Advanced reasoning and coding",
      },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        description: "Cost-optimized for high throughput",
      },
      {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash (Preview)",
        description: "Next-gen balanced speed and capability",
      },
      {
        id: "gemini-3-pro-preview",
        name: "Gemini 3 Pro (Preview)",
        description: "Next-gen most intelligent multimodal model",
      },
    ],
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "One API key for many low-cost models (openrouter.ai)",
    requiresApiKey: true,
    envKeyVar: "OPENROUTER_API_KEY",
    defaultModel: "deepseek/deepseek-v4-flash-0731",
    models: [
      {
        id: "deepseek/deepseek-v4-flash-0731",
        name: "DeepSeek V4 Flash",
        description: "Same model as DeepSeek direct, often cheaper",
      },
      {
        id: "qwen/qwen3.7-flash",
        name: "Qwen 3.7 Flash",
        description: "Cheapest capable model, strong multilingual",
      },
      {
        id: "google/gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash Lite",
        description: "Google's high-throughput tier via OpenRouter",
      },
      {
        id: "deepseek/deepseek-v4-pro-0813",
        name: "DeepSeek V4 Pro",
        description: "Enhanced DeepSeek tier via OpenRouter",
      },
      {
        id: "moonshotai/kimi-k3",
        name: "Kimi K3",
        description: "Frontier open-weight model, premium pricing",
      },
      {
        id: "openrouter/auto-beta",
        name: "Auto Router",
        description: "Let OpenRouter pick a suitable model",
      },
    ],
  },
};

/**
 * Whether a model id must be treated as an OpenAI-style reasoning model
 * (max_completion_tokens, fixed temperature). Falls back to a pattern check
 * for ids not present in the registry (e.g. hand-entered or stale ones).
 */
export function isReasoningModel(modelId: string): boolean {
  for (const provider of Object.values(PROVIDER_METADATA)) {
    const info = provider.models.find((m) => m.id === modelId);
    if (info) return info.reasoning === true;
  }
  return /^(gpt-5|o\d)/.test(modelId);
}

/**
 * True when the model id is known to the given provider's registry.
 */
export function isKnownModel(
  provider: AIProviderType,
  modelId: string,
): boolean {
  return PROVIDER_METADATA[provider].models.some((m) => m.id === modelId);
}
