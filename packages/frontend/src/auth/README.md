# Authentication System

This directory contains the authentication system for the EcBot frontend application, built with NextAuth.js and Discord OAuth.

## Overview

The authentication system provides:
- Discord OAuth integration
- JWT-based sessions
- Client and server-side authentication guards
- Comprehensive error handling
- TypeScript support

## Components

### Core Files

- `lib/auth.ts` - NextAuth configuration
- `lib/auth-utils.ts` - Server-side authentication utilities
- `middleware.ts` - Route protection middleware

### Components

- `components/auth/ProtectedRoute.tsx` - Client-side route protection
- `components/auth/ServerAuthGuard.tsx` - Server-side route protection
- `components/auth/AuthStatus.tsx` - Authentication status display
- `contexts/AuthContext.tsx` - Authentication context provider

### Hooks

- `hooks/useAuth.ts` - Authentication hook for client components

### Pages

- `app/auth/signin/page.tsx` - Sign-in page
- `app/auth/error/page.tsx` - Authentication error page

## Usage

### Client-Side Authentication

```tsx
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please sign in</div>;

  return <div>Welcome, {user?.name}!</div>;
}
```

### Server-Side Authentication

```tsx
import { requireAuth } from '@/lib/auth-utils';

export default async function ProtectedPage() {
  const session = await requireAuth();
  
  return <div>Welcome, {session.user?.name}!</div>;
}
```

### Route Protection

#### Client-Side
```tsx
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <div>Protected content</div>
    </ProtectedRoute>
  );
}
```

#### Server-Side
```tsx
import { ServerAuthGuard } from '@/components/auth/ServerAuthGuard';

export default async function ProtectedPage() {
  return (
    <ServerAuthGuard>
      <div>Protected content</div>
    </ServerAuthGuard>
  );
}
```

## Environment Variables

Required environment variables:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
```

## Discord OAuth Setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to OAuth2 settings
4. Add redirect URI: `http://localhost:3000/api/auth/callback/discord`
5. Copy Client ID and Client Secret to environment variables

## Session Management

Sessions are managed using JWT tokens with the following configuration:
- Session duration: 30 days
- JWT max age: 30 days
- Automatic token refresh
- Secure cookie settings in production

## Error Handling

The system handles various authentication errors:
- OAuth errors (signin, callback, account creation)
- Session errors
- Network errors
- Configuration errors

All errors are displayed on the `/auth/error` page with user-friendly messages.

## Testing

Authentication components are thoroughly tested:
- Unit tests for hooks and utilities
- Component tests for UI elements
- Integration tests for authentication flows

Run tests with:
```bash
npm test
```

## Security Features

- CSRF protection
- Secure session cookies
- JWT token validation
- Route-level protection
- Automatic session refresh
- Secure redirect handling