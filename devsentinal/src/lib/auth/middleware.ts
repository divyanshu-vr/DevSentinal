import { NextRequest } from "next/server";
import { auth0 } from "./auth0";
import { createServiceRoleClient } from "./supabase-server";
import {
  getGitHubIdFromAuth0User,
  getEmailFromAuth0User,
  getNameFromAuth0User,
  getAvatarUrlFromAuth0User,
} from "./auth0";

export type User = {
  id: string;
  github_id: string;
  email: string;
  name: string;
  avatar_url: string;
};

export async function requireAuth(req: NextRequest): Promise<User | null> {
  try {
    const session = await auth0.getSession(req);

    if (!session || !session.user) {
      return null;
    }

    const auth0User = session.user;

    const githubId = getGitHubIdFromAuth0User(auth0User);
    const email = getEmailFromAuth0User(auth0User);
    const name = getNameFromAuth0User(auth0User);
    const avatarUrl = getAvatarUrlFromAuth0User(auth0User);

    if (!githubId || !email || !name) {
      console.error("Missing required Auth0 user fields", {
        githubId,
        email,
        name,
      });
      return null;
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from("users")
      .upsert(
        {
          github_id: githubId,
          email: email,
          name: name,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "github_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting user:", error);
      return null;
    }

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

export async function isRequestAuthenticated(
  req: NextRequest
): Promise<boolean> {
  const session = await auth0.getSession(req);
  return !!session?.user;
}
