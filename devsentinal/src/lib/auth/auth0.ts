import { Auth0Client } from "@auth0/nextjs-auth0/server";

/**
 * Auth0 client instance
 * Used for all server-side authentication operations
 */
export const auth0 = new Auth0Client();

/**
 * Get the current Auth0 session
 * @returns Auth0 session object or null if not authenticated
 */
export async function getSession() {
  return await auth0.getSession();
}

/**
 * Get the current authenticated user
 * @returns User object with Auth0 user info or null if not authenticated
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Check if the request has a valid Auth0 session
 * @returns True if user is authenticated
 */
export async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}

/**
 * Get the Auth0 user ID from the session
 * @returns Auth0 user ID (sub) or null
 */
export async function getUserId() {
  const user = await getCurrentUser();
  return user?.sub || null;
}

/**
 * Extract GitHub ID from Auth0 user profile
 * Auth0 stores GitHub ID in the user's identities array
 * @param user Auth0 user object
 * @returns GitHub ID as string or null
 */
export function getGitHubIdFromAuth0User(user: Record<string, unknown> | null | undefined): string | null {
  if (!user) return null;

  // Auth0 stores connected social identities in the identities array
  const identities = user.identities as Array<{ provider: string; user_id: string }> | undefined;
  const githubIdentity = identities?.find(
    (identity) => identity.provider === "github"
  );

  if (githubIdentity) {
    // Connection name might be "github" and the user_id contains the numeric ID
    return githubIdentity.user_id;
  }

  // Fallback: Check if github ID is in the user object directly
  return (user.github_id as string | null) || null;
}

/**
 * Extract user email from Auth0 session
 * @param user Auth0 user object
 * @returns User email or null
 */
export function getEmailFromAuth0User(user: Record<string, unknown> | null | undefined): string | null {
  return (user?.email as string | null) || null;
}

/**
 * Extract user name from Auth0 session
 * @param user Auth0 user object
 * @returns User name or null
 */
export function getNameFromAuth0User(user: Record<string, unknown> | null | undefined): string | null {
  return (user?.name as string | null) || null;
}

/**
 * Extract user avatar URL from Auth0 session
 * @param user Auth0 user object
 * @returns Avatar URL or null
 */
export function getAvatarUrlFromAuth0User(user: Record<string, unknown> | null | undefined): string | null {
  // Auth0 provides picture URL for authenticated users
  return (user?.picture as string | null) || null;
}
