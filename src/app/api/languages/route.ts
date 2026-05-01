import { NextRequest, NextResponse } from "next/server";
import { withSecurity, RELAXED_SECURITY } from "@/lib/security/middleware";
import DatabaseManager from "@/lib/database";
import { ApiResponse } from "@/lib/types";

async function languagesHandler() {
  const db = DatabaseManager.getInstance();
  const languages = await db.getAllLanguages();

  const response: ApiResponse<typeof languages> = {
    success: true,
    data: languages,
  };

  return NextResponse.json(response);
}

export const GET = withSecurity(languagesHandler, RELAXED_SECURITY);
