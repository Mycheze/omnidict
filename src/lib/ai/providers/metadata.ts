/**
 * Client-safe types and metadata for AI providers
 * This file contains NO server-side imports and can be safely used in client components
 */

export type AIProviderType = "deepseek" | "chatgpt" | "claude" | "gemini";

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderMetadata {
  id: AIProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  models: ModelInfo[];
}

/**
 * Provider metadata with available models
 * Updated: May 2026 (DeepSeek v4 release — legacy names deprecated July 2026)
 */
export const PROVIDER_METADATA: Record<AIProviderType, ProviderMetadata> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    description: "Free AI model using system API key",
    requiresApiKey: false,
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
    models: [
      {
        id: "gpt-5.2",
        name: "GPT-5.2",
        description: "Latest flagship model for coding and agentic tasks",
      },
      {
        id: "gpt-5.1",
        name: "GPT-5.1",
        description: "Flagship model with configurable reasoning effort",
      },
      {
        id: "gpt-5",
        name: "GPT-5",
        description: "Coding, reasoning, and agentic tasks",
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        description: "Faster, cost-efficient GPT-5 variant",
      },
      {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        description: "Fastest, cheapest GPT-5 for simple tasks",
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
      },
      {
        id: "o4-mini",
        name: "O4 Mini",
        description: "Compact reasoning model",
      },
      {
        id: "o3-mini",
        name: "O3 Mini",
        description: "Fast, affordable reasoning model",
      },
    ],
  },
  claude: {
    id: "claude",
    name: "Claude",
    description: "Anthropic Claude models",
    requiresApiKey: true,
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
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "General-purpose tasks (deprecated March 2026)",
      },
    ],
  },
};
