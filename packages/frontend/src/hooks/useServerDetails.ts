import { useState, useEffect, useCallback } from 'react';

interface ServerMember {
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot: boolean;
  };
  nick: string | null;
  roles: string[];
  joined_at: string;
  premium_since: string | null;
  permissions?: string;
}

interface DetailedServerInfo {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  description: string | null;
  member_count: number;
  presence_count?: number;
  owner_id: string;
  verification_level: number;
  features: string[];
  created_at: string;
  bot_in_server: boolean;
  detailed_data_available: boolean;
  members?: {
    sample: ServerMember[];
    total_fetched: number;
    fetch_error: string | null;
  };
  error?: string;
}

interface UseServerDetailsReturn {
  serverDetails: DetailedServerInfo | null;
  members: ServerMember[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  fetchMembers: (limit?: number) => Promise<void>;
  membersLoading: boolean;
  membersError: string | null;
}

export function useServerDetails(serverId: string | null): UseServerDetailsReturn {
  const [serverDetails, setServerDetails] = useState<DetailedServerInfo | null>(null);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const fetchServerDetails = useCallback(async () => {
    if (!serverId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/backend/servers/${serverId}/details`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setServerDetails(data.data);
        
        // If we got member sample data, set it
        if (data.data.members?.sample) {
          setMembers(data.data.members.sample);
        }
      } else {
        throw new Error(data.error?.message || 'Failed to fetch server details');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to fetch server details:', err);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  const fetchMembers = useCallback(async (limit: number = 100) => {
    if (!serverId) return;

    setMembersLoading(true);
    setMembersError(null);

    try {
      const response = await fetch(`/api/backend/servers/${serverId}/members?limit=${limit}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setMembers(data.data.members);
      } else {
        throw new Error(data.error?.message || 'Failed to fetch members');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMembersError(errorMessage);
      console.error('Failed to fetch server members:', err);
    } finally {
      setMembersLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (serverId) {
      fetchServerDetails();
    } else {
      setServerDetails(null);
      setMembers([]);
      setError(null);
    }
  }, [serverId, fetchServerDetails]);

  return {
    serverDetails,
    members,
    loading,
    error,
    refetch: fetchServerDetails,
    fetchMembers,
    membersLoading,
    membersError,
  };
}