import { NextRequest } from 'next/server';
import type { User } from '@/types';

/**
 * Stub: returns a hardcoded user until Developer D delivers the real middleware.
 * Replace with actual Auth0 middleware when available.
 */
export async function requireAuth(req: NextRequest): Promise<User | null> {
  // TODO: Replace with real Auth0 middleware from Developer D
  return {
    id: '00000000-0000-0000-0000-000000000001',
    github_id: 'stub-github-id',
    username: 'stub-user',
    email: 'stub@example.com',
    avatar_url: null,
    github_token: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
