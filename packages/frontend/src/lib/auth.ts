import { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function refreshBackendToken(discordTokens: any) {
  if (!discordTokens.discordId) {
    console.error('Cannot refresh backend token without discordId.');
    return null;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'nextauth_integration',
        discordUser: {
          id: discordTokens.discordId,
          username: discordTokens.discordUsername,
          avatar: discordTokens.discordAvatar,
          email: discordTokens.discordEmail,
        },
        discordTokens: {
          accessToken: discordTokens.discordAccessToken,
          refreshToken: discordTokens.discordRefreshToken,
          expiresIn: Math.max(0, Math.floor(((discordTokens.discordExpiresAt || 0) * 1000 - Date.now()) / 1000)),
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Backend authentication failed:', response.status, errorBody);
      return null;
    }

    const data = await response.json();
    if (data.success && data.data.token) {
      console.log('✅ Backend JWT successfully obtained/refreshed.');
      return {
        backendToken: data.data.token,
        backendTokenExpiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) - (60 * 60 * 1000),
      };
    }
    
    console.error('Backend response did not contain a token.');
    return null;
  } catch (error) {
    console.error('Error authenticating with backend:', error);
    return null;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: 'identify email guilds' } },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // 1. Initial sign-in: Populate token with all necessary info from Discord.
      if (account && profile) {
        token.discordId = (profile as any).id;
        token.discordUsername = (profile as any).username;
        token.discordAvatar = (profile as any).avatar;
        token.discordEmail = (profile as any).email;
        token.discordAccessToken = account.access_token;
        token.discordRefreshToken = account.refresh_token;
        token.discordExpiresAt = account.expires_at;
      }

      // 2. Stale Session Check: Only force re-login if this is a completely empty token
      if (!token.discordId && !account) {
        console.warn('Stale session detected (missing discordId). Forcing re-authentication.');
        return {};
      }

      // 3. Backend Token Check: Ensure the backendToken exists and is not expired.
      const backendTokenExists = !!token.backendToken;
      const tokenIsExpired = token.backendTokenExpiresAt ? Date.now() >= (token.backendTokenExpiresAt as number) : true;

      if (!backendTokenExists || tokenIsExpired) {
        if (tokenIsExpired) console.log('Backend token expired or missing, refreshing...');
        
        const refreshedAuth = await refreshBackendToken(token);
        if (refreshedAuth) {
          token.backendToken = refreshedAuth.backendToken;
          token.backendTokenExpiresAt = refreshedAuth.backendTokenExpiresAt;
        } else {
          // CRITICAL FIX: Don't destroy session on backend token refresh failure
          // Keep the Discord session intact, just remove the backend token
          console.warn('Backend token refresh failed, but keeping Discord session intact');
          delete token.backendToken;
          delete token.backendTokenExpiresAt;
        }
      }

      return token;
    },
    async session({ session, token }) {
      // 4. Pass all necessary data to the session object.
      if (token.discordId) {
        session.user.id = token.discordId as string;
        // This part is restored to fix the test page and ensure data is available client-side.
        (session as any).discordTokens = {
          discordId: token.discordId,
          discordUsername: token.discordUsername,
          discordAvatar: token.discordAvatar,
          discordEmail: token.discordEmail,
          discordAccessToken: token.discordAccessToken,
          discordRefreshToken: token.discordRefreshToken,
          discordExpiresAt: token.discordExpiresAt,
        };
      }
      if (token.backendToken) {
        (session as any).backendToken = token.backendToken;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      console.log('🔄 NextAuth redirect callback called');
      console.log('🔄 URL:', url);
      console.log('🔄 BaseURL:', baseUrl);
      
      // Prevent automatic redirects to dashboard
      // Only redirect to dashboard if explicitly requested
      if (url.startsWith('/dashboard')) {
        console.log('🔄 Allowing dashboard redirect:', url);
        return url;
      }
      // Always redirect to home page after sign in unless explicitly specified
      console.log('🔄 Redirecting to home page:', baseUrl);
      return baseUrl;
    },
  },
  session: {
    strategy: 'jwt',
  },
  debug: process.env.NODE_ENV === 'development',
};
