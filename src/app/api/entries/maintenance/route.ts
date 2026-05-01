import { NextRequest, NextResponse } from "next/server";
import { withSecurity, STRICT_SECURITY } from "@/lib/security/middleware";
import { sanitizeError } from "@/lib/security/validation";
import { DictionaryService } from "@/lib/services/DictionaryService";
import { ApiResponse } from "@/lib/types";

async function maintenanceHandler(_request: NextRequest) {
  const dictionaryService = DictionaryService.getInstance();

  try {
    const result = await dictionaryService.performMaintenance();

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || "Maintenance failed",
      };
      return NextResponse.json(response, { status: 500 });
    }

    const response: ApiResponse = {
      success: true,
      message: "Maintenance completed successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in maintenanceHandler:", error);

    const response: ApiResponse = {
      success: false,
      error: sanitizeError(error),
    };

    return NextResponse.json(response, { status: 500 });
  }
}

// Export the secured handler
export const POST = withSecurity(maintenanceHandler, STRICT_SECURITY);
