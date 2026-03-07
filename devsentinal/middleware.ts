/**
 * Root middleware for Auth0 authentication
 * Handles session management and route protection
 */
import type { NextRequest } from "next/server";
import { auth0 } from "./src/lib/auth/auth0";

export async function middleware(request: NextRequest) {
  // Use Auth0 middleware to handle authentication
  // This automatically manages session cookies and authentication state
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
