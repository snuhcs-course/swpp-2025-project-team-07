import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiRequestWithAuth } from './apiRequest';

// Mock dependencies
vi.mock('@/services/auth', () => ({
  loadAuth: vi.fn(),
  saveAuth: vi.fn(),
  clearAuth: vi.fn(),
  refreshToken: vi.fn(),
}));

import { loadAuth, saveAuth, clearAuth, refreshToken } from '@/services/auth';

const mockLoadAuth = loadAuth as ReturnType<typeof vi.fn>;
const mockSaveAuth = saveAuth as ReturnType<typeof vi.fn>;
const mockClearAuth = clearAuth as ReturnType<typeof vi.fn>;
const mockRefreshToken = refreshToken as ReturnType<typeof vi.fn>;

describe('apiRequestWith Auth', () => {
  const mockTokens = {
    access: 'mock-access-token',
    refresh: 'mock-refresh-token',
  };
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    username: 'testuser',
    date_joined: '2024-01-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('successful requests', () => {
    it('makes authenticated request with bearer token', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: 'test' }),
      });

      const result = await apiRequestWithAuth('/api/test', { method: 'GET' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
            'Content-Type': 'application/json',
          }),
          method: 'GET',
        })
      );
      expect(result).toEqual({ data: 'test' });
    });

    it('handles POST requests with body', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await apiRequestWithAuth('/api/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/create'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        })
      );
    });

    it('handles non-JSON responses', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        json: async () => { throw new Error('Not JSON'); },
      });

      const result = await apiRequestWithAuth('/api/text');

      expect(result).toBeUndefined();
    });
  });

  describe('token refresh on 401', () => {
    it('refreshes token and retries on token expiration', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      const newTokens = {
        access: 'new-access-token',
        refresh: 'new-refresh-token',
      };
      mockRefreshToken.mockResolvedValue(newTokens);

      // First call: 401 with token expired
      // Second call: Success after refresh
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ code: 'token_not_valid' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: 'success after refresh' }),
        });

      const result = await apiRequestWithAuth('/api/test');

      expect(mockRefreshToken).toHaveBeenCalledWith('mock-refresh-token');
      expect(mockSaveAuth).toHaveBeenCalledWith(newTokens, mockUser);
      expect(result).toEqual({ data: 'success after refresh' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('handles token refresh with expired message in detail', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      mockRefreshToken.mockResolvedValue({
        access: 'new-token',
        refresh: 'new-refresh',
      });

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ detail: 'token has expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        });

      await apiRequestWithAuth('/api/test');

      expect(mockRefreshToken).toHaveBeenCalled();
    });

    it('clears auth and throws error when refresh fails', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });
      mockRefreshToken.mockRejectedValue(new Error('Refresh failed'));

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ code: 'token_not_valid' }),
      });

      await expect(apiRequestWithAuth('/api/test')).rejects.toThrow(
        'Session expired'
      );

      expect(mockClearAuth).toHaveBeenCalled();
    });

    it('does not retry if no refresh token available', async () => {
      mockLoadAuth.mockReturnValue({
        tokens: { access: 'token', refresh: null },
        user: mockUser,
      });

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: 'Unauthorized' }),
      });

      await expect(apiRequestWithAuth('/api/test')).rejects.toThrow();

      expect(mockRefreshToken).not.toHaveBeenCalled();
    });

    it('does not retry on second 401 (prevents infinite loop)', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });
      mockRefreshToken.mockResolvedValue({
        access: 'new-token',
        refresh: 'new-refresh',
      });

      // Both calls return 401
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ code: 'token_not_valid' }),
      });

      await expect(apiRequestWithAuth('/api/test')).rejects.toThrow();

      // Should only call fetch twice (initial + one retry)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('throws error when not authenticated', async () => {
      mockLoadAuth.mockReturnValue({ tokens: null, user: null });

      await expect(apiRequestWithAuth('/api/test')).rejects.toThrow(
        'Not authenticated'
      );
    });

    it('throws error with detail message from response', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: 'Bad request error' }),
      });

      await expect(apiRequestWithAuth('/api/test')).rejects.toThrow(
        'Bad request error'
      );
    });

    it('throws error with generic message when no detail', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await expect(apiRequestWithAuth('/api/test')).rejects.toThrow(
        'Request failed'
      );
    });

    it('uses error field if detail not present', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Custom error message' }),
      });

      await expect(apiRequestWithAuth('/api/test')).rejects.toThrow(
        'Custom error message'
      );
    });
  });

  describe('request configuration', () => {
    it('includes CORS mode and credentials', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await apiRequestWithAuth('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mode: 'cors',
          credentials: 'include',
        })
      );
    });

    it('merges custom headers with default headers', async () => {
      mockLoadAuth.mockReturnValue({ tokens: mockTokens, user: mockUser });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await apiRequestWithAuth('/api/test', {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const headers = fetchCall[1].headers;

      // Verify custom header is present
      expect(headers['X-Custom-Header']).toBe('custom-value');
    });
  });
});
