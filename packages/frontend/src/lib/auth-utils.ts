import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth';
import { redirect } from 'next/navigation';

/**
 * Get the current session on the server side
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Require authentication on the server side
 * Redirects to sign-in page if not authenticated
 */
export async function requireAuth() {
  const session = await getSession();
  
  if (!session) {
    redirect('/auth/signin');
  }
  
  return session;
}

/**
 * Check if user is authenticated on the server side
 */
export async function isAuthenticated() {
  const session = await getSession();
  return !!session;
}

/**
 * Get user information from session
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

/**
 * Get Discord access token from session
 */
export async function getDiscordAccessToken() {
  const session = await getSession();
  return (session as any)?.accessToken;
}

/**
 * Check if user has specific Discord permissions
 */
export function hasDiscordPermissions(permissions: string[], userPermissions: string[]) {
  return permissions.every(permission => userPermissions.includes(permission));
}

/**
 * Format Discord user for display
 */
export function formatDiscordUser(user: any) {
  return {
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    displayName: user.global_name || user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
  };
}