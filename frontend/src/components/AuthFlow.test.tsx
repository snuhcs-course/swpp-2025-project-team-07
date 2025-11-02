import '@/test/mockMotion';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

const authMocks = vi.hoisted(() => ({
  loadAuthMock: vi.fn(),
  getProfileMock: vi.fn(),
  clearAuthMock: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  loadAuth: authMocks.loadAuthMock,
  getProfile: authMocks.getProfileMock,
  clearAuth: authMocks.clearAuthMock,
}));

const { loadAuthMock, getProfileMock, clearAuthMock } = authMocks;

let loginSuccessHandler: ((email: string) => void) | undefined;
let switchToSignup: (() => void) | undefined;
let switchToForgot: (() => void) | undefined;

vi.mock('./LoginForm', () => ({
  LoginForm: (props: any) => {
    loginSuccessHandler = props.onAuthSuccess;
    switchToSignup = props.onSwitchToSignup;
    switchToForgot = props.onSwitchToForgotPassword;
    return <div data-testid="login-form" />;
  },
}));

let signupSuccessHandler: ((email: string) => void) | undefined;
let switchToLoginFromSignup: (() => void) | undefined;

vi.mock('./SignupForm', () => ({
  SignupForm: (props: any) => {
    signupSuccessHandler = props.onAuthSuccess;
    switchToLoginFromSignup = props.onSwitchToLogin;
    return <div data-testid="signup-form" />;
  },
}));

let switchToLoginFromForgot: (() => void) | undefined;

vi.mock('./ForgotPasswordForm', () => ({
  ForgotPasswordForm: (props: any) => {
    switchToLoginFromForgot = props.onSwitchToLogin;
    return <div data-testid="forgot-form" />;
  },
}));

import { AuthFlow } from './AuthFlow';

describe('AuthFlow', () => {
  beforeEach(() => {
    loadAuthMock.mockReset();
    getProfileMock.mockReset();
    clearAuthMock.mockReset();
    loginSuccessHandler = undefined;
    switchToSignup = undefined;
    switchToForgot = undefined;
    signupSuccessHandler = undefined;
    switchToLoginFromSignup = undefined;
    switchToLoginFromForgot = undefined;
  });

  const renderAuthFlow = (props: any = {}) => {
    loadAuthMock.mockReturnValue({ tokens: null, user: null });
    getProfileMock.mockResolvedValue({ id: 1, email: 'test@example.com', username: 'Test', date_joined: '' });
    return render(<AuthFlow {...props} />);
  };

  it('shows login form by default', () => {
    renderAuthFlow();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('switches to signup form when requested', async () => {
    renderAuthFlow();
    expect(switchToSignup).toBeDefined();

    await act(async () => {
      switchToSignup?.();
    });

    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
  });

  it('switches to forgot password form when requested', async () => {
    renderAuthFlow();
    expect(switchToForgot).toBeDefined();

    await act(async () => {
      switchToForgot?.();
    });

    expect(screen.getByTestId('forgot-form')).toBeInTheDocument();
  });

  it('returns to login after signup success', async () => {
    renderAuthFlow();

    await act(async () => {
      switchToSignup?.();
    });

    expect(signupSuccessHandler).toBeDefined();

    await act(async () => {
      signupSuccessHandler?.('new@example.com');
    });

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('invokes onAuthSuccess after login success', async () => {
    const onAuthSuccess = vi.fn();
    renderAuthFlow({ onAuthSuccess });

    expect(loginSuccessHandler).toBeDefined();

    await act(async () => {
      loginSuccessHandler?.('user@example.com');
    });

    expect(onAuthSuccess).toHaveBeenCalledTimes(1);
  });

  it('restores session when tokens are present', async () => {
    const onAuthSuccess = vi.fn();
    loadAuthMock.mockReturnValue({
      tokens: { access: 'access', refresh: 'refresh' },
      user: { id: 1, email: 'user@example.com', username: 'User', date_joined: '' },
    });
    getProfileMock.mockResolvedValue({ id: 1, email: 'user@example.com', username: 'User', date_joined: '' });

    render(<AuthFlow onAuthSuccess={onAuthSuccess} />);

    await waitFor(() => {
      expect(getProfileMock).toHaveBeenCalledWith('access');
      expect(onAuthSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('clears auth when profile fetch fails', async () => {
    loadAuthMock.mockReturnValue({
      tokens: { access: 'bad', refresh: 'refresh' },
      user: { id: 1, email: 'user@example.com', username: 'User', date_joined: '' },
    });
    getProfileMock.mockRejectedValue(new Error('invalid token'));

    render(<AuthFlow />);

    await waitFor(() => {
      expect(getProfileMock).toHaveBeenCalled();
      expect(clearAuthMock).toHaveBeenCalled();
    });
  });

  it('switches from forgot password back to login', async () => {
    renderAuthFlow();

    await act(async () => {
      switchToForgot?.();
    });

    expect(switchToLoginFromForgot).toBeDefined();

    await act(async () => {
      switchToLoginFromForgot?.();
    });

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });
});
