import OpenAI from "openai";
import { ProviderConfig, ProviderTestResult } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";

export class DeepSeekProvider extends BaseProvider {
  private client: OpenAI;
  private model: string;

  constructor(config?: ProviderConfig) {
    super("DeepSeek");

    const apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DeepSeek API key is required");
    }

    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: config?.baseURL || "https://api.deepseek.com",
    });

    this.model = config?.model || "deepseek-v4-flash";
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 10,
      });

      if (response.choices && response.choices.length > 0) {
        return {
          success: true,
          message: "Connection successful",
        };
      }

      return {
        success: false,
        error: "No response from API",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
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
      // @ts-expect-error -- DeepSeek v4 extra_body for thinking mode control via OpenAI SDK
      extra_body: { thinking: { type: "disabled" } },
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }
}
