"use client";

import { useEffect } from "react";

/**
 * Login page
 * Redirects user to Auth0 Universal Login
 */
export default function LoginPage() {
  useEffect(() => {
    // Redirect to Auth0 login
    window.location.href = "/api/auth/login";
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">DevSentinel</h1>
        <p className="text-xl text-gray-300 mb-8">
          Redirecting to login...
        </p>
        <div className="inline-block">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </div>
    </div>
  );
}
