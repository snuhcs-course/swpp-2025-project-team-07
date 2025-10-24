import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveAuth, loadAuth, clearAuth } from './auth';

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
});
