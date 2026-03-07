# Auth0 Setup Guide for DevSentinel

This guide explains how to configure Auth0 authentication for your Next.js project.

## Environment Variables

Create a `.env.local` file in the `devsentinal` directory with the following variables:

```env
# Auth0 Configuration
AUTH0_SECRET=your-random-secret-here-at-least-32-chars
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://YOUR_DOMAIN.auth0.com
AUTH0_CLIENT_ID=your_auth0_client_id
AUTH0_CLIENT_SECRET=your_auth0_client_secret

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Step-by-Step Setup

### 1. Create Auth0 Application

1. Go to [Auth0 Dashboard](https://manage.auth0.com)
2. Create a new application
3. Choose "Regular Web Applications"
4. Configure:
   - **Name**: DevSentinel
   - **Application Type**: Regular Web Application

### 2. Configure Auth0 Settings

1. Go to **Settings** tab
2. Set **Allowed Callback URLs**:
   ```
   http://localhost:3000/api/auth/callback
   ```
   For production:
   ```
   https://your-domain.com/api/auth/callback
   ```

3. Set **Allowed Logout URLs**:
   ```
   http://localhost:3000
   ```
   For production:
   ```
   https://your-domain.com
   ```

4. Set **Allowed Web Origins**:
   ```
   http://localhost:3000
   ```

5. Copy and save:
   - `CLIENT_ID`
   - `CLIENT_SECRET`
   - `AUTH0_DOMAIN` from the Domain field

### 3. Configure GitHub Connection

1. Go to **Connections** → **Social** → **GitHub**
2. Click **Create**
3. You'll need GitHub OAuth credentials:
   - Create a GitHub OAuth App on https://github.com/settings/developers
   - Set Authorization callback URL to: `https://YOUR_AUTH0_DOMAIN/login/callback`
   - Copy Client ID and Client Secret to Auth0
4. Enable the GitHub connection for your application

### 4. Create AUTH0_SECRET

Generate a secure random string (at least 32 characters):

```bash
openssl rand -hex 16  # or use: head -c 32 /dev/urandom | base64
```

### 5. Update Supabase Table

Make sure your Supabase database has the `users` table with the correct schema:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_github_id ON users(github_id);
```

## Project Structure

```
src/
├── lib/auth/
│   ├── auth0.ts              # Auth0 configuration and helpers
│   ├── middleware.ts         # Authentication middleware with User type
│   └── supabase-server.ts    # Supabase server client
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx    # Login page (redirects to /api/auth/login)
│   │   ├── callback/page.tsx # Login callback handler
│   │   └── logout/page.tsx   # Logout page
│   ├── api/auth/
│   │   ├── login/route.ts    # Auth0 login handler
│   │   ├── callback/route.ts # Auth0 callback handler
│   │   ├── logout/route.ts   # Logout handler
│   │   └── me/route.ts       # Get current user endpoint
│   └── middleware.ts         # Root middleware for route protection
```

## Usage

### Protected Routes

These routes now require authentication:
- `/dashboard/*`
- `/project/*`

### Public Routes

These routes are accessible without authentication:
- `/`
- `/login`
- `/api/auth/*`

### Access Current User

In server components or API routes:

```typescript
import { getSession, getCurrentUser } from "@/lib/auth/auth0";

export async function MyComponent() {
  const user = await getCurrentUser();

  if (!user) {
    return <div>Not logged in</div>;
  }

  return <div>Welcome, {user.name}!</div>;
}
```

In middleware or protected API routes:

```typescript
import { requireAuth } from "@/lib/auth/middleware";

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use user.id, user.email, user.github_id, user.name, user.avatar_url
  return Response.json(user);
}
```

### Check Authentication in API Routes

```typescript
import { isRequestAuthenticated } from "@/lib/auth/middleware";

export async function GET(req: NextRequest) {
  const authenticated = await isRequestAuthenticated();

  if (!authenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Protected logic here
}
```

## Testing

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Visit http://localhost:3000/login
3. You should be redirected to Auth0 Universal Login
4. After login, you should be redirected to http://localhost:3000/callback
5. Session should be established in Supabase
6. You should have access to /dashboard and /project routes

## Troubleshooting

### "Missing required Auth0 user fields"
- Make sure GitHub connection is enabled in Auth0
- Verify the user has authorized GitHub access
- Check Auth0 logs for connection issues

### "Missing Supabase environment variables"
- Ensure all Supabase variables are set in `.env.local`
- Service role key should only be used server-side

### Session not persisting
- Check browser cookies for `appSession` cookie
- Verify `AUTH0_SECRET` is set and consistent
- Check Auth0 logs for session creation issues

### "Unauthorized" on protected routes
- Make sure you're logged in (visit /login)
- Check that /api/auth/me returns user data
- Verify Supabase user was created with `SELECT * FROM users;`

## Production Deployment

1. Set environment variables in your hosting platform (Vercel, etc.)
2. Update `AUTH0_BASE_URL` to your production domain
3. Update Auth0 Callback and Logout URLs to production domain
4. Use Supabase production database credentials
5. Ensure service role key is only available server-side

## Learn More

- [Auth0 Next.js SDK Documentation](https://auth0.com/docs/quickstart/webapp/nextjs/interactive)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Middleware Documentation](https://nextjs.org/docs/advanced-features/middleware)
