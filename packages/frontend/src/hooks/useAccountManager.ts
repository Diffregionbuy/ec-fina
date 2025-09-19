import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';

interface AccountInfo {
  discordId: string;
  username: string;
  email: string;
  avatar: string | null;
  lastUsed: number;
}

interface UseAccountManagerReturn {
  currentAccount: AccountInfo | null;
  availableAccounts: AccountInfo[];
  isMultipleAccounts: boolean;
  switchAccount: () => Promise<void>;
  clearAllAccounts: () => Promise<void>;
  addAccount: () => Promise<void>;
}

const ACCOUNTS_STORAGE_KEY = 'discord_accounts_history';
const MAX_STORED_ACCOUNTS = 3;

export function useAccountManager(): UseAccountManagerReturn {
  const { data: session } = useSession();
  const [availableAccounts, setAvailableAccounts] = useState<AccountInfo[]>([]);

  // Load stored accounts from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (stored) {
        const accounts: AccountInfo[] = JSON.parse(stored);
        setAvailableAccounts(accounts);
      }
    } catch (error) {
      console.error('Failed to load stored accounts:', error);
    }
  }, []);

  // Update stored accounts when session changes
  useEffect(() => {
    if (session?.user && session.discordTokens?.discordId) {
      const currentAccount: AccountInfo = {
        discordId: session.discordTokens.discordId,
        username: session.user.name || 'Unknown',
        email: session.user.email || '',
        avatar: session.user.image || null,
        lastUsed: Date.now()
      };

      setAvailableAccounts(prev => {
        // Remove existing entry for this account
        const filtered = prev.filter(acc => acc.discordId !== currentAccount.discordId);
        
        // Add current account at the beginning
        const updated = [currentAccount, ...filtered].slice(0, MAX_STORED_ACCOUNTS);
        
        // Store in localStorage
        try {
          localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to store accounts:', error);
        }
        
        return updated;
      });
    }
  }, [session]);

  const currentAccount = session?.user && session.discordTokens?.discordId ? {
    discordId: session.discordTokens.discordId,
    username: session.user.name || 'Unknown',
    email: session.user.email || '',
    avatar: session.user.image || null,
    lastUsed: Date.now()
  } : null;

  const isMultipleAccounts = availableAccounts.length > 1;

  const switchAccount = useCallback(async () => {
    // Clear current session and prompt for new login
    await signOut({ redirect: false });
    
    // Clear any cached data that might interfere
    try {
      // Clear server data cache
      const cacheKeys = Object.keys(localStorage).filter(key => 
        key.includes('server') || key.includes('guild') || key.includes('discord')
      );
      cacheKeys.forEach(key => {
        if (key !== ACCOUNTS_STORAGE_KEY) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Failed to clear cache during account switch:', error);
    }
    
    // Initiate new login
    await signIn('discord');
  }, []);

  const addAccount = useCallback(async () => {
    // Same as switch account - allows adding another account
    await switchAccount();
  }, [switchAccount]);

  const clearAllAccounts = useCallback(async () => {
    // Clear all stored account data
    try {
      localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
      setAvailableAccounts([]);
    } catch (error) {
      console.error('Failed to clear stored accounts:', error);
    }
    
    // Sign out completely
    await signOut({ callbackUrl: '/' });
  }, []);

  return {
    currentAccount,
    availableAccounts,
    isMultipleAccounts,
    switchAccount,
    clearAllAccounts,
    addAccount
  };
}