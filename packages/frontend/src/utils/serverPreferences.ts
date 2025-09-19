/**
 * Server Preferences Utility
 * Manages localStorage for remembering user's last visited server
 */

const STORAGE_KEY = 'ecbot_last_visited_server';

export interface ServerPreference {
  serverId: string;
  timestamp: number;
  serverName?: string;
}

/**
 * Save the last visited server to localStorage
 */
export function saveLastVisitedServer(serverId: string, serverName?: string): void {
  try {
    const preference: ServerPreference = {
      serverId,
      timestamp: Date.now(),
      serverName
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch (error) {
    console.warn('Failed to save server preference to localStorage:', error);
  }
}

/**
 * Get the last visited server from localStorage
 */
export function getLastVisitedServer(): ServerPreference | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const preference: ServerPreference = JSON.parse(stored);
    
    // Check if preference is not too old (30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    if (preference.timestamp < thirtyDaysAgo) {
      clearLastVisitedServer();
      return null;
    }
    
    return preference;
  } catch (error) {
    console.warn('Failed to retrieve server preference from localStorage:', error);
    clearLastVisitedServer();
    return null;
  }
}

/**
 * Clear the last visited server preference
 */
export function clearLastVisitedServer(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear server preference from localStorage:', error);
  }
}

/**
 * Check if a server ID is valid and accessible in the provided server list
 */
export function isServerAccessible(serverId: string, availableServers: { id: string }[]): boolean {
  return availableServers.some(server => server.id === serverId);
}

/**
 * Get the best server to redirect to based on preferences and available servers
 */
export function getBestServerForRedirect(availableServers: { id: string; name: string }[]): string | null {
  if (availableServers.length === 0) return null;
  
  // Try to get last visited server
  const lastVisited = getLastVisitedServer();
  
  if (lastVisited && isServerAccessible(lastVisited.serverId, availableServers)) {
    return lastVisited.serverId;
  }
  
  // Fallback to first available server
  return availableServers[0].id;
}