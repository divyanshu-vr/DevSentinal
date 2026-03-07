import { NextRequest } from "next/server";
import { auth0 } from "./auth0";
import { createServiceRoleClient } from "./supabase-server";
import {
  getGitHubIdFromAuth0User,
  getEmailFromAuth0User,
  getNameFromAuth0User,
  getAvatarUrlFromAuth0User,
} from "./auth0";

/**
 * User type representing the authenticated user in the system
 */
export type User = {
  id: string; // Supabase UUID
  github_id: string;
  email: string;
  name: string;
  avatar_url: string;
};

/**
 * Authenticate a request and return the current user
 *
 * Logic:
 * 1. Extract Auth0 session from the request
 * 2. If no session, return null
 * 3. Get user info from Auth0 session
 * 4. Upsert user in Supabase using github_id
 * 5. Return User object
 *
 * @param req NextRequest object
 * @returns User object or null if not authenticated
 */
export async function requireAuth(req: NextRequest): Promise<User | null> {
  try {
    // Get Auth0 session
    const session = await auth0.getSession(req);

    if (!session || !session.user) {
      return null;
    }

    const auth0User = session.user;

    // Extract required fields from Auth0 user
    const githubId = getGitHubIdFromAuth0User(auth0User);
    const email = getEmailFromAuth0User(auth0User);
    const name = getNameFromAuth0User(auth0User);
    const avatarUrl = getAvatarUrlFromAuth0User(auth0User);

    // Validate required fields
    if (!githubId || !email || !name) {
      console.error(
        "Missing required Auth0 user fields",
        { githubId, email, name }
      );
      return null;
    }

    // Get Supabase service role client
    const supabase = createServiceRoleClient();

    // Upsert user in Supabase
    const { data, error } = await supabase
      .from("users")
      .upsert(
        {
          github_id: githubId,
          email: email,
          name: name,
          avatar_url: avatarUrl || null,
          // Add updated_at for tracking last login
          updated_at: new Date().toISOString(),
        },
        {
          // Use github_id as unique identifier for upsert
          onConflict: "github_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting user to Supabase:", error);
      return null;
    }

    if (!data) {
      console.error("No user data returned from Supabase upsert");
      return null;
    }

    // Return user object with Supabase ID
    return {
      id: data.id,
      github_id: data.github_id,
      email: data.email,
      name: data.name,
      avatar_url: data.avatar_url || "",
    };
  } catch (error) {
    console.error("Error in requireAuth:", error);
    return null;
  }
}

/**
 * Check if a request is authenticated
 * Simpler version that just checks if session exists
 *
 * @returns true if user is authenticated
 */
export async function isRequestAuthenticated(
  req: NextRequest
): Promise<boolean> {
  const session = await auth0.getSession(req);
  return !!session?.user;
}
