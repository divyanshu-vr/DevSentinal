import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/middleware";

/**
 * GET /api/auth/me
 * Returns the current authenticated user
 *
 * @returns {object} User object with id, github_id, email, name, avatar_url
 * @returns {null} null if not authenticated (401 status)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json(user, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/auth/me:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
