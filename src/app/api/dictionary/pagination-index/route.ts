import { NextRequest, NextResponse } from "next/server";
import { withSecurity, RELAXED_SECURITY } from "@/lib/security/middleware";
import { sanitizeError } from "@/lib/security/validation";
import DatabaseManager from "@/lib/database";

async function paginationIndexHandler(req: NextRequest) {
  try {
    const filters = await req.json();
    const db = DatabaseManager.getInstance();

    // Default to a page size of 50, same as the main list
    const index = await db.getPaginationIndex(filters, 50);

    return NextResponse.json({
      success: true,
      data: index,
    });
  } catch (error) {
    console.error("Error fetching pagination index:", error);
    return NextResponse.json(
      { success: false, error: sanitizeError(error) },
      { status: 500 },
    );
  }
}

// Export the secured handler
export const POST = withSecurity(paginationIndexHandler, RELAXED_SECURITY);
