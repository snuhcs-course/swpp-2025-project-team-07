// Centralized API request utility with automatic token refresh

import { loadAuth, saveAuth, clearAuth, refreshToken } from '@/services/auth';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

// Makes authenticated API requests with auto token refresh on 401
export async function apiRequestWithAuth<T>(
  path: string,
  options: RequestInit = {},
  retryCount: number = 0
): Promise<T> {
  const { tokens, user } = loadAuth();
  if (!tokens) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens.access}`,
      ...(options.headers || {}),
    },
    mode: 'cors',
    credentials: 'include',
    ...options,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : undefined;

  // Handle token expiration (retry once with refresh)
  if (response.status === 401 && retryCount === 0) {
    const isTokenExpired =
      data?.code === 'token_not_valid' ||
      data?.detail?.includes('token') ||
      data?.messages?.some((m: any) => m.message === 'Token is expired');

    if (isTokenExpired && tokens.refresh) {
      try {
        console.log('[API] Access token expired, refreshing...');
        const newTokens = await refreshToken(tokens.refresh);
        if (user) saveAuth(newTokens, user);
        console.log('[API] Token refreshed, retrying request');
        return apiRequestWithAuth<T>(path, options, retryCount + 1);
      } catch (refreshError) {
        console.error('[API] Token refresh failed:', refreshError);
        clearAuth();
        throw new Error('Session expired. Please login again.');
      }
    }
  }

  if (!response.ok) {
    const errorMessage = (data && (data.detail || data.error)) || 'Request failed';
    throw new Error(errorMessage);
  }

  return data as T;
}
