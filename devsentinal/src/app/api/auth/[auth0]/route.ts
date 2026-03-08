/**
 * Dynamic Auth0 route handler
 * Handles all Auth0 routes: /api/auth/login, /api/auth/callback, /api/auth/logout, etc.
 */
import { auth0 } from "@/lib/auth/auth0";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return auth0.middleware(req as unknown as Request);
}

export async function POST(req: NextRequest) {
  return auth0.middleware(req as unknown as Request);
}
