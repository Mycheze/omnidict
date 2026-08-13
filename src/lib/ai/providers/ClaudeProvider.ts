import Anthropic from "@anthropic-ai/sdk";
import { ProviderConfig } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";
import { PROVIDER_METADATA } from "./metadata";

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

    this.model = config.model || PROVIDER_METADATA.claude.defaultModel;
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
