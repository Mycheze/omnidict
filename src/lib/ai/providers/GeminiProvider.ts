import { GoogleGenAI } from "@google/genai";
import { ProviderConfig } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";
import { PROVIDER_METADATA } from "./metadata";

export class GeminiProvider extends BaseProvider {
  private client: GoogleGenAI;
  private modelName: string;

  constructor(config: ProviderConfig) {
    super("Gemini");

    if (!config.apiKey) {
      throw new Error("Google API key is required");
    }

    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.modelName = config.model || PROVIDER_METADATA.gemini.defaultModel;
  }

  protected async callApi(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role === "user");
    const systemText = systemMessages.map((m) => m.content).join("\n");
    const userText = userMessages.map((m) => m.content).join("\n");

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents: userText,
      config: {
        systemInstruction: systemText || undefined,
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });

    return response.text?.trim() || "";
  }
}
