/**
 * Auth0 Callback Page (Deprecated)
 *
 * This page should NOT be used. Auth0 should be configured to redirect to:
 * http://localhost:3000/api/auth/callback
 *
 * This page is kept for backwards compatibility only.
 */
import { redirect } from "next/navigation";

export default function CallbackPage() {
  // Redirect to the correct API callback route
  // Update your Auth0 dashboard to use /api/auth/callback directly!
  redirect("/");
}

