/**
 * Root middleware for Auth0 authentication
 * Handles session management and route protection
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Dev bypass: skip Auth0 middleware when not configured
  if (
    !process.env.AUTH0_DOMAIN ||
    !process.env.AUTH0_CLIENT_ID ||
    !process.env.AUTH0_SECRET
  ) {
    return NextResponse.next();
  }

  // Use Auth0 middleware to handle authentication
  const { auth0 } = await import("./src/lib/auth/auth0");
  return await auth0.middleware(request);
}

/**
 * Configure which routes to run middleware on
 * The middleware only needs to run on protected routes, not on/api/auth/* routes
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - /api/auth/* (auth routes are handled by route handlers)
     * - / (public home page)
     * - /login (public login page)
     * - /logout (public logout page)
     * - /callback (public callback page)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth|^/$|^/login$|^/logout$|^/callback$).*)",
  ],
};
