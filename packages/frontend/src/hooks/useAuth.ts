'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';

interface BackendAuthState {
  token: string | null;
  isValid: boolean;
  lastValidated: number;
  expiresAt: number;
}

// Global cache for token requests to prevent multiple simultaneous calls
const tokenRequestCache = new Map<string, Promise<string | null>>();

export function useAuth(requireAuth: boolean = true) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [backendAuth, setBackendAuth] = useState<BackendAuthState>({
    token: null,
    isValid: false,
    lastValidated: 0,
    expiresAt: 0,
  });
  
  // Ref to track if component is mounted
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Authenticate with backend and get JWT token with deduplication
  const authenticateWithBackend = useCallback(async () => {
    if (!session) {
      return null;
    }

    const cacheKey = `${session.user?.email || 'unknown'}-${Date.now() - (Date.now() % 30000)}`; // 30s cache window
    
    // Check if there's already a pending request
    if (tokenRequestCache.has(cacheKey)) {
      return await tokenRequestCache.get(cacheKey);
    }

    const tokenPromise = (async () => {
      try {
        const response = await fetch('/api/auth/backend-token', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.token) {
            const now = Date.now();
            const newAuthState = {
              token: data.token,
              isValid: true,
              lastValidated: now,
              expiresAt: now + (6 * 60 * 60 * 1000), // 6 hours expiry
            };
            
            if (isMountedRef.current) {
              setBackendAuth(newAuthState);
              // Store token in localStorage for persistence
              localStorage.setItem('backend_auth', JSON.stringify(newAuthState));
            }
            
            return data.token;
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Backend authentication failed:', error);
        }
      } finally {
        // Clean up cache after request completes
        setTimeout(() => tokenRequestCache.delete(cacheKey), 1000);
      }

      return null;
    })();

    tokenRequestCache.set(cacheKey, tokenPromise);
    return await tokenPromise;
  }, [session]);

  // Check if backend token is still valid with improved logic
  const isBackendTokenValid = useCallback(() => {
    if (!backendAuth.isValid || !backendAuth.token) {
      return false;
    }

    const now = Date.now();
    
    // Check if token has expired
    if (backendAuth.expiresAt && now >= backendAuth.expiresAt) {
      return false;
    }
    
    // Check if token is too old (fallback check)
    const tokenAge = now - backendAuth.lastValidated;
    const maxAge = 5 * 60 * 1000; // 5 minutes fallback

    return tokenAge < maxAge;
  }, [backendAuth]);

  // Get valid backend token (authenticate if needed) with smart caching
  const getBackendToken = useCallback(async () => {
    // First check if current token is still valid
    if (isBackendTokenValid()) {
      return backendAuth.token;
    }

    // Check if we're close to expiry but still valid - refresh in background
    const now = Date.now();
    const timeUntilExpiry = backendAuth.expiresAt - now;
    const shouldRefreshInBackground = timeUntilExpiry > 0 && timeUntilExpiry < (30 * 60 * 1000); // 30 minutes

    if (shouldRefreshInBackground && backendAuth.token) {
      // Return current token immediately, refresh in background
      authenticateWithBackend().catch(console.error);
      return backendAuth.token;
    }

    // Token is invalid or expired, get new one
    return await authenticateWithBackend();
  }, [isBackendTokenValid, authenticateWithBackend, backendAuth.token, backendAuth.expiresAt]);

  useEffect(() => {
    console.log('🔐 useAuth effect - requireAuth:', requireAuth, 'status:', status);
    if (requireAuth && status === 'unauthenticated') {
      console.log('🔐 useAuth: Redirecting to signin because unauthenticated');
      router.push('/auth/signin');
    }
  }, [status, requireAuth, router]);

  // Load backend auth from localStorage on mount with validation
  useEffect(() => {
    const stored = localStorage.getItem('backend_auth');
    if (stored) {
      try {
        const parsedAuth = JSON.parse(stored);
        // Validate stored token hasn't expired
        const now = Date.now();
        if (parsedAuth.expiresAt && now < parsedAuth.expiresAt) {
          setBackendAuth(parsedAuth);
        } else {
          // Clean up expired token
          localStorage.removeItem('backend_auth');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to parse stored backend auth:', error);
        }
        localStorage.removeItem('backend_auth');
      }
    }
  }, []);

  // Authenticate with backend when session becomes available
  useEffect(() => {
    if (status === 'authenticated' && !isBackendTokenValid()) {
      authenticateWithBackend();
    }
  }, [status, authenticateWithBackend, isBackendTokenValid]);

  // Clear backend auth when session ends
  useEffect(() => {
    if (status === 'unauthenticated') {
      setBackendAuth({
        token: null,
        isValid: false,
        lastValidated: 0,
        expiresAt: 0,
      });
      localStorage.removeItem('backend_auth');
      // Clear token cache
      tokenRequestCache.clear();
    }
  }, [status]);

  return {
    session,
    status,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    user: session?.user,
    backendToken: backendAuth.token,
    isBackendAuthenticated: isBackendTokenValid(),
    getBackendToken,
    authenticateWithBackend,
  };
}

export function useRequireAuth() {
  return useAuth(true);
}