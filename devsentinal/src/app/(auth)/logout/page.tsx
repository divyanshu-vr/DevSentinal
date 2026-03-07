"use client";

import { useEffect } from "react";

/**
 * Logout page
 * Redirects user to logout endpoint which clears the session
 */
export default function LogoutPage() {
  useEffect(() => {
    // Redirect to logout endpoint
    window.location.href = "/api/auth/logout";
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Logging out...</h1>
        <div className="inline-block">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </div>
    </div>
  );
}
