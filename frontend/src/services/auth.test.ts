import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveAuth,
  loadAuth,
  clearAuth,
  login,
  signup,
  logout,
  refreshToken,
  getProfile,
} from './auth';

const originalFetch = globalThis.fetch;

/**
 * Example unit test for auth service
 * This demonstrates how to test service/utility functions
 */
describe('Auth Service', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('saveAuth', () => {
    it('should save tokens and user to localStorage', () => {
      const tokens = { access: 'access-token', refresh: 'refresh-token' };
      const user = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        date_joined: '2024-01-01',
      };

      saveAuth(tokens, user);

      expect(localStorage.getItem('auth_tokens')).toBe(JSON.stringify(tokens));
      expect(localStorage.getItem('auth_user')).toBe(JSON.stringify(user));
    });
  });

  describe('loadAuth', () => {
    it('should load tokens and user from localStorage', () => {
      const tokens = { access: 'access-token', refresh: 'refresh-token' };
      const user = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        date_joined: '2024-01-01',
      };

      localStorage.setItem('auth_tokens', JSON.stringify(tokens));
      localStorage.setItem('auth_user', JSON.stringify(user));

      const result = loadAuth();

      expect(result.tokens).toEqual(tokens);
      expect(result.user).toEqual(user);
    });

    it('should return null when localStorage is empty', () => {
      const result = loadAuth();

      expect(result.tokens).toBeNull();
      expect(result.user).toBeNull();
    });
  });

  describe('clearAuth', () => {
    it('should remove auth data from localStorage', () => {
      const tokens = { access: 'access-token', refresh: 'refresh-token' };
      const user = {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        date_joined: '2024-01-01',
      };

      saveAuth(tokens, user);

      // Verify data exists
      expect(localStorage.getItem('auth_tokens')).toBeTruthy();
      expect(localStorage.getItem('auth_user')).toBeTruthy();

      // Clear auth
      clearAuth();

      // Verify data is removed
      expect(localStorage.getItem('auth_tokens')).toBeNull();
      expect(localStorage.getItem('auth_user')).toBeNull();
    });
  });

  describe('API helpers', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      (globalThis as any).fetch = fetchMock;
    });

    afterEach(() => {
      (globalThis as any).fetch = originalFetch;
    });

    it('login posts credentials and returns parsed response', async () => {
      const responseData = {
        message: 'ok',
        user: { id: 1, email: 'user@test.com', username: 'user', date_joined: '2024-01-01' },
        access: 'token',
        refresh: 'refresh',
      };

      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => responseData,
      });

      const result = await login('user@test.com', 'secret');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/auth/login/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'user@test.com', password: 'secret' }),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
      expect(result).toEqual(responseData);
    });

    it('signup posts registration payload', async () => {
      const responseData = {
        message: 'welcome',
        user: { id: 2, email: 'new@test.com', username: 'newbie', date_joined: '2024-03-01' },
        access: 'access-token',
        refresh: 'refresh-token',
      };

      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => responseData,
      });

      const result = await signup('new@test.com', 'newbie', 'pass', 'pass');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/auth/signup/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'new@test.com',
            username: 'newbie',
            password: 'pass',
            password_confirm: 'pass',
          }),
        }),
      );
      expect(result).toEqual(responseData);
    });

    it('logout posts refresh token and resolves', async () => {
      const responseData = { message: 'logged out' };
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => responseData,
      });

      const result = await logout('refresh-token');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/auth/logout/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh: 'refresh-token' }),
        }),
      );
      expect(result).toEqual(responseData);
    });

    it('refreshToken posts the refresh token and returns new tokens', async () => {
      const tokens = { access: 'new-access', refresh: 'new-refresh' };
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => tokens,
      });

      const result = await refreshToken('old-refresh');

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/auth/refresh/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh: 'old-refresh' }),
        }),
      );
      expect(result).toEqual(tokens);
    });

    it('getProfile supplies bearer token header', async () => {
      const user = { id: 3, email: 'who@test.com', username: 'who', date_joined: '2024-04-01' };
      const tokens = { access: 'access-token', refresh: 'refresh-token' };
      
      // Setup auth state in localStorage
      localStorage.setItem('auth_tokens', JSON.stringify(tokens));
      localStorage.setItem('auth_user', JSON.stringify(user));

      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => user,
      });

      const result = await getProfile();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/user/profile/',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
        }),
      );
      expect(result).toEqual(user);
    });

    it('throws a descriptive error when API responds with detail', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({ detail: 'Invalid credentials' }),
      });

      await expect(login('bad@test.com', 'wrong')).rejects.toThrow('Invalid credentials');
    });

    it('throws a generic error when detail is missing', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('text/plain') },
        json: async () => ({}),
      });

      await expect(logout('refresh-token')).rejects.toThrow('Request failed');
    });

    it('extracts error message from string payload', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => 'String error message',
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('String error message');
    });

    it('extracts error message from message field', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({ message: 'Error from message field' }),
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Error from message field');
    });

    it('extracts error message from error field', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({ error: 'Error from error field' }),
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Error from error field');
    });

    it('collects messages from array values', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({ errors: ['Error 1', 'Error 2', 'Error 3'] }),
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Error 1 Error 2 Error 3');
    });

    it('collects messages from nested object values', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({
          field_errors: {
            email: 'Invalid email',
            password: 'Too short',
          },
        }),
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Invalid email Too short');
    });

    it('collects messages from deeply nested structures', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({
          errors: {
            form: {
              fields: ['Field error 1', 'Field error 2'],
            },
          },
        }),
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Field error 1 Field error 2');
    });

    it('handles null and undefined in nested structures', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({
          errors: {
            field1: null,
            field2: undefined,
            field3: 'Valid error',
          },
        }),
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Valid error');
    });

    it('handles mixed array with strings and objects', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({
          errors: ['String error', { nested: 'Object error' }],
        }),
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('String error Object error');
    });

    it('falls back to generic error when payload is null', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => null,
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Request failed');
    });

    it('handles non-JSON responses', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        headers: { get: vi.fn().mockReturnValue('text/html') },
      });

      await expect(login('test@test.com', 'pass')).rejects.toThrow('Request failed');
    });
  });
});
