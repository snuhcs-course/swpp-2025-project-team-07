import '@/test/mockMotion';
import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authMocks = vi.hoisted(() => ({
  signupMock: vi.fn(),
  saveAuthMock: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  signup: authMocks.signupMock,
  saveAuth: authMocks.saveAuthMock,
}));

const { signupMock, saveAuthMock } = authMocks;

import { SignupForm } from './SignupForm';

describe('SignupForm', () => {
  beforeEach(() => {
    signupMock.mockReset();
    saveAuthMock.mockReset();
  });

  it('shows validation errors for missing fields', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Full name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByText('You must accept the terms and conditions')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.type(screen.getByLabelText('Full name'), 'Mismatch User');
    await user.type(screen.getByLabelText('Email address'), 'mismatch@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm password'), 'Password2');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('submits signup data and saves auth on success', async () => {
    const user = userEvent.setup();
    const onAuthSuccess = vi.fn();

    signupMock.mockResolvedValue({
      access: 'access-token',
      refresh: 'refresh-token',
      user: { id: 1, email: 'new@example.com', username: 'New', date_joined: '' },
      message: 'ok',
    });

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={onAuthSuccess} />
    );

    await user.type(screen.getByLabelText('Full name'), 'New User');
    await user.type(screen.getByLabelText('Email address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm password'), 'Password1');
    const termsCheckbox = screen.getByRole('checkbox');
    await user.click(termsCheckbox);

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signupMock).toHaveBeenCalledWith('new@example.com', 'New User', 'Password1', 'Password1');
    expect(saveAuthMock).toHaveBeenCalledWith({ access: 'access-token', refresh: 'refresh-token' }, expect.objectContaining({ email: 'new@example.com' }));
    expect(onAuthSuccess).toHaveBeenCalledWith('new@example.com');
  });

  it('toggles password visibility controls', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    const password = screen.getByLabelText('Password') as HTMLInputElement;
    const confirm = screen.getByLabelText('Confirm password') as HTMLInputElement;

    const passwordToggle = password.closest('div')?.querySelector('button');
    const confirmToggle = confirm.closest('div')?.querySelector('button');

    expect(passwordToggle).toBeTruthy();
    expect(confirmToggle).toBeTruthy();
    expect(password.type).toBe('password');
    expect(confirm.type).toBe('password');

    await user.click(passwordToggle as HTMLButtonElement);
    await user.click(confirmToggle as HTMLButtonElement);

    expect(password.type).toBe('text');
    expect(confirm.type).toBe('text');
  });
});
