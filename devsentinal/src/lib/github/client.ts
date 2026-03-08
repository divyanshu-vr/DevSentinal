import { Octokit, App } from 'octokit';

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Create an Octokit instance authenticated as a GitHub App installation.
 * PRs created with this will be authored by the bot.
 * Falls back to user token if App credentials are not configured.
 */
export async function createAppOctokit(userToken?: string): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && privateKey && installationId) {
    const app = new App({
      appId,
      privateKey,
    });

    return app.getInstallationOctokit(Number(installationId));
  }

  // Fallback to user token
  const token = userToken || process.env.GITHUB_TOKEN || '';
  return new Octokit({ auth: token });
}
