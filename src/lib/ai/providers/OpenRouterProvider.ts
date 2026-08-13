import OpenAI from "openai";
import { ProviderConfig } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";
import { PROVIDER_METADATA } from "./metadata";

/**
 * OpenRouter provider — one OpenAI-compatible API for many hosted models.
 * Serves as the price hedge against single-vendor increases: switching the
 * default model is a metadata change, not a new integration.
 */
export class OpenRouterProvider extends BaseProvider {
  private client: OpenAI;
  private model: string;

  constructor(config?: ProviderConfig) {
    super("OpenRouter");

    const apiKey = config?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config?.baseURL || "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "https://dict.refold.la",
        "X-Title": "Omnidict",
      },
    });

    this.model = config?.model || PROVIDER_METADATA.openrouter.defaultModel;
  }

  protected async callApi(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }
}
