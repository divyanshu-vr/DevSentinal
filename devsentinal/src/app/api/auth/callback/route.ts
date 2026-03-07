/**
 * Auth0 Callback API Route
 * Handles the OAuth code exchange when Auth0 redirects after login
 * GET /api/auth/callback?code=...&state=...
 */
import { auth0 } from "@/lib/auth/auth0";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Delegate to Auth0 middleware to handle the OAuth callback
    return await auth0.middleware(request as unknown as Request);
  } catch (error) {
    console.error("Error handling Auth0 callback:", error);
    throw error;
  }
}
