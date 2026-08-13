import { NextRequest, NextResponse } from "next/server";
import AIManager from "@/lib/ai";
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

  // Build the provider through the SAME path production generation uses
  // (AIManager.createProviderInstance), so a green test means the real
  // config — including the selected model — actually works.
  try {
    const manager = AIManager.createProviderInstance({
      providerType,
      apiKey: typeof apiKey === "string" ? apiKey : undefined,
      model: typeof model === "string" ? model : undefined,
    });
    const result = await manager.testConnection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export const POST = withSecurity(testProviderHandler, DEFAULT_SECURITY);
