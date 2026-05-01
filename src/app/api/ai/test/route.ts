import { NextRequest, NextResponse } from "next/server";
import { createProvider } from "@/lib/ai/providers";
import { isValidProviderType } from "@/lib/ai/providers/metadata";
import { withSecurity, DEFAULT_SECURITY } from "@/lib/security/middleware";

async function testProviderHandler(request: NextRequest) {
  const body = await request.json();
  const { providerType, apiKey, model } = body;

  if (!providerType || !isValidProviderType(providerType)) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing provider type" },
      { status: 400 },
    );
  }

  const validatedProvider = providerType;

  // For DeepSeek, we don't need an API key from the request
  const config =
    validatedProvider === "deepseek"
      ? { model: model || "deepseek-v4-flash", apiKey: "" }
      : { apiKey, model };

  if (!config.apiKey && validatedProvider !== "deepseek") {
    return NextResponse.json(
      {
        success: false,
        error: "API key is required for non-DeepSeek providers",
      },
      { status: 400 },
    );
  }

  // Create provider and test connection
  const provider = createProvider(validatedProvider, config);
  const result = await provider.testConnection();

  return NextResponse.json(result);
}

export const POST = withSecurity(testProviderHandler, DEFAULT_SECURITY);
