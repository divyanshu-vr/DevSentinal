"use client";

import { useEffect } from "react";

/**
 * Callback page
 * Handles Auth0 login callback and redirects to dashboard
 * This page is typically reached after Auth0 redirects back from login
 */
export default function CallbackPage() {
  useEffect(() => {
    // The /api/auth/callback route handles the Auth0 callback
    // and sets up the session. This page just shows a loading state.
    // After the session is established, redirect to dashboard
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          // Session established, redirect to dashboard
          window.location.href = "/dashboard";
        } else {
          // Session failed, redirect to login
          window.location.href = "/login";
        }
      } catch (error) {
        console.error("Error checking auth session:", error);
        window.location.href = "/login";
      }
    };

    // Check session after a short delay
    const timer = setTimeout(checkSession, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">DevSentinel</h1>
        <p className="text-xl text-gray-300 mb-8">
          Completing login...
        </p>
        <div className="inline-block">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </div>
    </div>
  );
}
