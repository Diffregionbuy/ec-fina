// Jest imports are global, no need to import them
import { apiClient, ApiClientError, AuthenticationError, ValidationError, NetworkError } from '../api-client';
import { getSession, signOut } from 'next-auth/react';

// Mock next-auth
jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signOut: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('ApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiClient.clearCache();
    
    // Default session mock
    mockGetSession.mockResolvedValue({
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
      user: { id: '1', name: 'Test User' },
      expires: '2024-12-31',
    });
  });

  describe('Authentication', () => {
    it('should throw AuthenticationError when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      await expect(apiClient.getUserProfile()).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when no access token', async () => {
      mockGetSession.mockResolvedValue({
        user: { id: '1', name: 'Test User' },
        expires: '2024-12-31',
      } as any);

      await expect(apiClient.getUserProfile()).rejects.toThrow(AuthenticationError);
    });

    it('should include authorization header in requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      } as Response);

      await apiClient.getUserProfile();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer valid-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('Token Refresh', () => {
    it('should attempt token refresh on 401 error', async () => {
      // First call returns 401
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { message: 'Token expired' } }),
        } as Response)
        // Refresh token call
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ accessToken: 'new-token' }),
        } as Response)
        // Retry original call
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: {} }),
        } as Response);

      await apiClient.getUserProfile();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'refresh-token' }),
        })
      );
    });

    it('should sign out user if refresh fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { message: 'Token expired' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { message: 'Refresh failed' } }),
        } as Response);

      await expect(apiClient.getUserProfile()).rejects.toThrow(AuthenticationError);
      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
    });
  });

  describe('Error Handling', () => {
    it('should throw ValidationError for 400 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { message: 'Invalid data', details: { field: 'required' } }
        }),
      } as Response);

      await expect(apiClient.createProduct({})).rejects.toThrow(ValidationError);
    });

    it('should handle fetch failures', async () => {
      const fetchError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(fetchError);

      await expect(apiClient.getUserProfile()).rejects.toThrow();
    });

    it('should handle server errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Internal server error' } }),
      } as Response);

      await expect(apiClient.getUserProfile()).rejects.toThrow(ApiClientError);
    });
  });

  describe('Caching', () => {
    it('should cache GET requests', async () => {
      const mockData = { success: true, data: { id: '1', name: 'Test' } };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      // First call
      const result1 = await apiClient.getUserProfile();
      // Second call should use cache
      const result2 = await apiClient.getUserProfile();

      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache on mutations', async () => {
      const mockData = { success: true, data: {} };
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      // Cache a server
      await apiClient.getServer('server1');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Update server should invalidate cache
      await apiClient.updateServer('server1', { name: 'Updated' });
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Next get should fetch fresh data
      await apiClient.getServer('server1');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should clear all cache', () => {
      // This is more of a smoke test since cache is private
      expect(() => apiClient.clearCache()).not.toThrow();
    });
  });

  describe('API Methods', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      } as Response);
    });

    it('should call user endpoints correctly', async () => {
      await apiClient.getUserProfile();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/profile'),
        expect.any(Object)
      );

      await apiClient.getUserServers();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/servers'),
        expect.any(Object)
      );
    });

    it('should call server endpoints correctly', async () => {
      await apiClient.getServer('server1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/servers/server1'),
        expect.any(Object)
      );

      await apiClient.updateServer('server1', { name: 'Test' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/servers/server1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Test' }),
        })
      );
    });

    it('should call product endpoints correctly', async () => {
      await apiClient.getProducts('server1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/products?server_id=server1'),
        expect.any(Object)
      );

      await apiClient.createProduct({ name: 'Test Product', server_id: 'server1' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/products'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test Product', server_id: 'server1' }),
        })
      );
    });

    it('should call wallet endpoints correctly', async () => {
      await apiClient.getWalletBalance();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/wallet/balance'),
        expect.any(Object)
      );

      await apiClient.requestWithdrawal(100, 'wallet-address');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/wallet/withdraw'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ amount: 100, address: 'wallet-address' }),
        })
      );
    });

    it('should call subscription endpoints correctly', async () => {
      await apiClient.getSubscriptionPlans();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/subscriptions/plans'),
        expect.any(Object)
      );

      await apiClient.subscribe('server1', 'plan1', 'card');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/subscriptions/subscribe'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            server_id: 'server1',
            plan_id: 'plan1',
            payment_method: 'card',
          }),
        })
      );
    });
  });
});