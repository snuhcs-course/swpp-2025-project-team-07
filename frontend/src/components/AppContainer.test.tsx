import '@/test/mockMotion';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const authMocks = vi.hoisted(() => ({
  loadAuthMock: vi.fn(),
  clearAuthMock: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  loadAuth: authMocks.loadAuthMock,
  clearAuth: authMocks.clearAuthMock,
}));

const { loadAuthMock, clearAuthMock } = authMocks;

let lastAuthSuccess: (() => void) | undefined;

vi.mock('./AuthFlow', () => ({
  AuthFlow: ({ onAuthSuccess }: { onAuthSuccess: () => void }) => {
    lastAuthSuccess = onAuthSuccess;
    return <div data-testid="auth-flow" />;
  },
}));

let lastSignOut: (() => void) | undefined;

vi.mock('./ChatInterface', () => ({
  ChatInterface: ({ onSignOut }: { onSignOut: () => void }) => {
    lastSignOut = onSignOut;
    return <div data-testid="chat-interface" />;
  },
}));

import { AppContainer } from './AppContainer';

describe('AppContainer', () => {
  beforeEach(() => {
    loadAuthMock.mockReset();
    clearAuthMock.mockReset();
    lastAuthSuccess = undefined;
    lastSignOut = undefined;
  });

  it('renders AuthFlow when no auth tokens are stored', () => {
    loadAuthMock.mockReturnValueOnce({ tokens: null, user: null });
    loadAuthMock.mockReturnValue({ tokens: null, user: null });

    render(<AppContainer />);

    expect(screen.getByTestId('auth-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-interface')).not.toBeInTheDocument();
  });

  it('renders ChatInterface when stored auth exists', () => {
    const user = { id: 1, email: 'test@example.com', username: 'Test', date_joined: '' };
    loadAuthMock.mockReturnValue({ tokens: { access: 'a', refresh: 'r' }, user });

    render(<AppContainer />);

    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-flow')).not.toBeInTheDocument();
  });

  it('switches to ChatInterface after auth success', async () => {
    const user = { id: 1, email: 'user@example.com', username: 'User', date_joined: '' };
    loadAuthMock
      .mockReturnValueOnce({ tokens: null, user: null })
      .mockReturnValue({ tokens: { access: 'token', refresh: 'refresh' }, user });

    render(<AppContainer />);

    expect(screen.getByTestId('auth-flow')).toBeInTheDocument();
    expect(lastAuthSuccess).toBeDefined();

    await act(async () => {
      lastAuthSuccess?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    });
  });

  it('handles sign out by clearing auth and returning to AuthFlow', async () => {
    const user = { id: 1, email: 'user@example.com', username: 'User', date_joined: '' };
    loadAuthMock.mockReturnValue({ tokens: { access: 'token', refresh: 'refresh' }, user });

    render(<AppContainer />);

    expect(lastSignOut).toBeDefined();

    await act(async () => {
      lastSignOut?.();
    });

    expect(clearAuthMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByTestId('auth-flow')).toBeInTheDocument();
    });
  });
});
