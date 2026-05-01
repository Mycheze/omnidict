import OpenAI from "openai";
import { ProviderConfig, ProviderTestResult } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";

export class ChatGPTProvider extends BaseProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: ProviderConfig) {
    super("ChatGPT");

    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    this.model = config.model || "gpt-4-turbo";
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const tokenParam = this.getTokenLimitParam(10);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "ping" }],
        ...tokenParam,
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
    const tokenParam = this.getTokenLimitParam(options.maxTokens || 2000);
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages,
      temperature: options.temperature,
      ...tokenParam,
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }

  private getTokenLimitParam(
    limit: number,
  ): { max_tokens: number } | { max_completion_tokens: number } {
    const newModels = [
      "gpt-5.2",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "o3-pro",
      "o3",
    ];
    const isNewModel = newModels.some((model) => this.model.includes(model));

    if (isNewModel) {
      return { max_completion_tokens: limit };
    }
    return { max_tokens: limit };
  }
}
