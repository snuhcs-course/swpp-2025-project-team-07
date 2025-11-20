import '@/test/mockMotion';
import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { loginMock, saveAuthMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  saveAuthMock: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  login: (...args: unknown[]) => loginMock(...args),
  saveAuth: (...args: unknown[]) => saveAuthMock(...args),
  getProfile: vi.fn(),
}));

import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  const renderForm = (overrides: Partial<React.ComponentProps<typeof LoginForm>> = {}) =>
    render(
      <LoginForm
        onSwitchToSignup={vi.fn()}
        onSwitchToForgotPassword={vi.fn()}
        onAuthSuccess={vi.fn()}
        {...overrides}
      />,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    loginMock.mockResolvedValue({
      message: 'ok',
      user: { id: 1, email: 'user@example.com', username: 'user', date_joined: '2024-01-01' },
      access: 'access-token',
      refresh: 'refresh-token',
    });
  });

  it('calls onSwitchToSignup when sign up link is clicked', async () => {
    const user = userEvent.setup();
    const onSwitchToSignup = vi.fn();
    renderForm({ onSwitchToSignup });

    await user.click(screen.getByText('Sign up'));
    expect(onSwitchToSignup).toHaveBeenCalledTimes(1);
  });

  it('calls onSwitchToForgotPassword when forgot password is clicked', async () => {
    const user = userEvent.setup();
    const onSwitchToForgotPassword = vi.fn();
    renderForm({ onSwitchToForgotPassword });

    await user.click(screen.getByText('Forgot password?'));
    expect(onSwitchToForgotPassword).toHaveBeenCalledTimes(1);
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderForm();

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleButton = passwordInput.closest('div')?.querySelector('button');
    expect(toggleButton).toBeTruthy();

    await user.click(toggleButton as HTMLButtonElement);
    expect(passwordInput.type).toBe('text');
  });

  it('validates inputs and shows helpful errors', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Email address'), 'invalid');
    await user.type(screen.getByLabelText('Password'), '123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const getEmailErrorText = () =>
      screen
        .getByLabelText('Email address')
        .closest('.space-y-2')!
        .querySelector('.text-sm.text-destructive')
        ?.textContent?.trim() ?? '';

    const getPasswordErrorText = () =>
      screen
        .getByLabelText('Password')
        .closest('.space-y-2')!
        .querySelector('.text-sm.text-destructive')
        ?.textContent?.trim() ?? '';

    await waitFor(() => {
      expect(getEmailErrorText()).toMatch(/Email is required|valid email/i);
      expect(getPasswordErrorText()).toMatch(/Password is required|at least 6/i);
    });
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('submits credentials, stores auth, and notifies success', async () => {
    const user = userEvent.setup();
    const onAuthSuccess = vi.fn();
    renderForm({ onAuthSuccess });

    await user.type(screen.getByLabelText('Email address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('user@example.com', 'password123'));
    expect(saveAuthMock).toHaveBeenCalledWith(
      { access: 'access-token', refresh: 'refresh-token' },
      expect.objectContaining({ email: 'user@example.com' }),
    );
    expect(onAuthSuccess).toHaveBeenCalledWith('user@example.com');
  });

  it('recovers from login errors without saving auth', async () => {
    const user = userEvent.setup();
    const onAuthSuccess = vi.fn();
    loginMock.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderForm({ onAuthSuccess });

    await user.type(screen.getByLabelText('Email address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
      expect(loginMock).toHaveBeenCalledTimes(1);
    });
    expect(saveAuthMock).not.toHaveBeenCalled();
    expect(onAuthSuccess).not.toHaveBeenCalled();
  });

  it('shows loading state while authenticating', async () => {
    const user = userEvent.setup();
    let resolveLogin: (value: unknown) => void = () => {};
    loginMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );

    renderForm();

    await user.type(screen.getByLabelText('Email address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    const submitButton = screen.getByRole('button', { name: 'Sign in' });

    await user.click(submitButton);
    expect(submitButton).toBeDisabled();
    expect(submitButton.querySelector('div')).toBeInTheDocument();

    await act(async () => {
      resolveLogin({
        message: 'ok',
        user: { email: 'user@example.com' },
        access: 'access-token',
        refresh: 'refresh-token',
      });
    });

    await waitFor(() => expect(submitButton).not.toBeDisabled());
  });

  it('shows error for invalid email format', async () => {
    const user = userEvent.setup();

    render(
      <LoginForm
        onSwitchToSignup={vi.fn()}
        onSwitchToForgotPassword={vi.fn()}
        onAuthSuccess={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText('Email address'), 'invalid-email');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
  });

  it('shows error for password shorter than 6 characters', async () => {
    const user = userEvent.setup();

    render(
      <LoginForm
        onSwitchToSignup={vi.fn()}
        onSwitchToForgotPassword={vi.fn()}
        onAuthSuccess={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText('Email address'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), '12345');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
  });
});
