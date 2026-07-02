import { GoogleGenerativeAI } from "@google/generative-ai";
import { ProviderConfig, ProviderTestResult } from "./ModelProvider";
import { BaseProvider, ChatMessage } from "./BaseProvider";

export class GeminiProvider extends BaseProvider {
  private client: GoogleGenerativeAI;
  private modelName: string;

  constructor(config: ProviderConfig) {
    super("Gemini");

    if (!config.apiKey) {
      throw new Error("Google API key is required");
    }

    this.client = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model || "gemini-2.5-flash";
  }

  async testConnection(): Promise<ProviderTestResult> {
    try {
      const model = this.client.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent("ping");
      const response = await result.response;
      const text = response.text();

      if (text) {
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
    const userText = userMessages.map((m) => m.content).join("\n");

    const fullPrompt = systemText + "\n\n" + userText;

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  }
}
