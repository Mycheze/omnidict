import { NextRequest, NextResponse } from "next/server";
import {
  PROVIDER_METADATA,
  isValidProviderType,
} from "@/lib/ai/providers/metadata";

/**
 * GET /api/ai/models?provider=<providerType>
 * Get available models for a provider
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get("provider");

    if (!provider || !isValidProviderType(provider)) {
      return NextResponse.json(
        { error: "Invalid or missing provider parameter" },
        { status: 400 },
      );
    }

    const metadata = PROVIDER_METADATA[provider];

    return NextResponse.json({
      provider: metadata.id,
      models: metadata.models,
    });
  } catch (error) {
    console.error("Error getting models:", error);
    return NextResponse.json(
      { error: "Failed to get models" },
      { status: 500 },
    );
  }
}
