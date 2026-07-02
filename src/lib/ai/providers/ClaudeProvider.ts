import Anthropic from "@anthropic-ai/sdk";
import { ProviderConfig, ProviderTestResult } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";

export class ClaudeProvider extends BaseProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: ProviderConfig) {
    super("Claude");

    if (!config.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });

    this.model = config.model || "claude-3-5-sonnet-20241022";
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      });

      if (response.content && response.content.length > 0) {
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
    const systemMessages = messages.filter((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role === "user");
    const systemText = systemMessages.map((m) => m.content).join("\n");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || 2000,
      system: systemText,
      messages: userMessages.map((m) => ({
        role: "user" as const,
        content: m.content,
      })),
      temperature: options.temperature,
    });

    const content = response.content[0];
    return content.type === "text" ? content.text : "";
  }
}
