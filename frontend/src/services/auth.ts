const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export type AuthTokens = { access: string; refresh: string };
export type AuthUser = { id: number; email: string; username: string; date_joined: string };
export type LoginResponse = {
  message: string;
  user: AuthUser;
  access: string;
  refresh: string;
};
export type SignupResponse = LoginResponse;

type ErrorPayload = Record<string, unknown>;

const extractErrorMessage = (payload: unknown): string | null => {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload === 'object') {
    const { detail, message, error } = payload as ErrorPayload;
    if (typeof detail === 'string') {
      return detail;
    }
    if (typeof message === 'string') {
      return message;
    }
    if (typeof error === 'string') {
      return error;
    }

    const collectMessages = (value: unknown): string[] => {
      if (!value) {
        return [];
      }
      if (typeof value === 'string') {
        return [value];
      }
      if (Array.isArray(value)) {
        return value.flatMap(collectMessages);
      }
      if (typeof value === 'object') {
        return Object.values(value).flatMap(collectMessages);
      }
      return [];
    };

    const messages = collectMessages(payload);
    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  return null;
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    mode: 'cors',
    credentials: 'include',
    ...options,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const errorMessage =
      extractErrorMessage(data) ||
      'Request failed';
    throw new Error(errorMessage);
  }

  return data as T;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function signup(email: string, username: string, password: string, password_confirm: string): Promise<SignupResponse> {
  return apiRequest<SignupResponse>('/api/auth/signup/', {
    method: 'POST',
    body: JSON.stringify({ email, username, password, password_confirm }),
  });
}

export async function logout(refresh: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/api/auth/logout/', {
    method: 'POST',
    body: JSON.stringify({ refresh }),
  });
}

export async function refreshToken(refresh: string): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/api/auth/refresh/', {
    method: 'POST',
    body: JSON.stringify({ refresh }),
  });
}

export async function getProfile(): Promise<AuthUser> {
  // Import at function level to avoid circular dependency
  const { apiRequestWithAuth } = await import('@/utils/apiRequest');

  return apiRequestWithAuth<AuthUser>('/api/user/profile/', {
    method: 'GET',
  });
}

export function saveAuth(tokens: AuthTokens, user: AuthUser) {
  localStorage.setItem('auth_tokens', JSON.stringify(tokens));
  localStorage.setItem('auth_user', JSON.stringify(user));
}

export function loadAuth(): { tokens: AuthTokens | null; user: AuthUser | null } {
  const tokensRaw = localStorage.getItem('auth_tokens');
  const userRaw = localStorage.getItem('auth_user');
  return {
    tokens: tokensRaw ? (JSON.parse(tokensRaw) as AuthTokens) : null,
    user: userRaw ? (JSON.parse(userRaw) as AuthUser) : null,
  };
}

export function clearAuth() {
  localStorage.removeItem('auth_tokens');
  localStorage.removeItem('auth_user');
}


