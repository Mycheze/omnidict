import OpenAI from "openai";
import { ProviderConfig } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";
import { PROVIDER_METADATA, isReasoningModel } from "./metadata";

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

    this.model = config.model || PROVIDER_METADATA.chatgpt.defaultModel;
  }

  protected async callApi(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const limit = options.maxTokens || 2000;
    // Reasoning models (GPT-5 family, o-series) require max_completion_tokens
    // and reject any temperature other than the default — omit it entirely.
    const params = isReasoningModel(this.model)
      ? { max_completion_tokens: limit }
      : { max_tokens: limit, temperature: options.temperature };

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages,
      ...params,
    });

    return response.choices[0]?.message?.content?.trim() || "";
  }
}
