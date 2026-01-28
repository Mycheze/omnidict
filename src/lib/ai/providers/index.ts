import {
  ProviderConfig,
  ModelProvider,
} from './ModelProvider';
import { AIProviderType } from './metadata';
import { DeepSeekProvider } from './DeepSeekProvider';
import { ChatGPTProvider } from './ChatGPTProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { GeminiProvider } from './GeminiProvider';

// Re-export metadata from client-safe file
export * from './metadata';

/**
 * Factory function to create a provider instance
 * SERVER-SIDE ONLY - Do not import this in client components
 */
export function createProvider(
  providerType: AIProviderType,
  config?: ProviderConfig
): ModelProvider {
  switch (providerType) {
    case 'deepseek':
      return new DeepSeekProvider(config);
    case 'chatgpt':
      if (!config?.apiKey) {
        throw new Error('ChatGPT requires an API key');
      }
      return new ChatGPTProvider(config);
    case 'claude':
      if (!config?.apiKey) {
        throw new Error('Claude requires an API key');
      }
      return new ClaudeProvider(config);
    case 'gemini':
      if (!config?.apiKey) {
        throw new Error('Gemini requires an API key');
      }
      return new GeminiProvider(config);
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}

// Re-export types and classes (SERVER-SIDE ONLY)
export * from './ModelProvider';
export { DeepSeekProvider } from './DeepSeekProvider';
export { ChatGPTProvider } from './ChatGPTProvider';
export { ClaudeProvider } from './ClaudeProvider';
export { GeminiProvider } from './GeminiProvider';

