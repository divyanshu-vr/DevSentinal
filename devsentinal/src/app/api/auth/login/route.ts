/**
 * Login endpoint - redirects user to Auth0 login
 * GET /api/auth/login
 */
import { auth0 } from "@/lib/auth/auth0";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    return await auth0.startInteractiveLogin({
      returnTo: new URL("/", request.url).toString(),
    });
  } catch (error) {
    console.error("Error in login route:", error);
    throw error;
  }
}
