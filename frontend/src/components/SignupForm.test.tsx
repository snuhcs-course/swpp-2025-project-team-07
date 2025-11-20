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

    expect(await screen.findByText('Username is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByText('You must accept the terms and conditions')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.type(screen.getByLabelText('Username'), 'Mismatch User');
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

    await user.type(screen.getByLabelText('Username'), 'New User');
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

  it('shows error for name shorter than 2 characters', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.type(screen.getByLabelText('Username'), 'A');
    await user.type(screen.getByLabelText('Email address'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password123');
    await user.type(screen.getByLabelText('Confirm password'), 'Password123');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Name must be at least 2 characters')).toBeInTheDocument();
  });

  it('shows error for invalid email format', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.type(screen.getByLabelText('Username'), 'ValidUser');
    await user.type(screen.getByLabelText('Email address'), 'invalid-email');
    await user.type(screen.getByLabelText('Password'), 'Password123');
    await user.type(screen.getByLabelText('Confirm password'), 'Password123');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
  });

  it('shows error for password shorter than 8 characters', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.type(screen.getByLabelText('Username'), 'ValidUser');
    await user.type(screen.getByLabelText('Email address'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1');
    await user.type(screen.getByLabelText('Confirm password'), 'Pass1');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('shows error for password without required complexity', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.type(screen.getByLabelText('Username'), 'ValidUser');
    await user.type(screen.getByLabelText('Email address'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password'); // no uppercase or number
    await user.type(screen.getByLabelText('Confirm password'), 'password');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Password must contain uppercase, lowercase, and number')).toBeInTheDocument();
  });

  it('handles signup failure and displays error message', async () => {
    const user = userEvent.setup();

    signupMock.mockRejectedValue(new Error('Email already exists'));

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    await user.type(screen.getByLabelText('Username'), 'Existing User');
    await user.type(screen.getByLabelText('Email address'), 'existing@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password123');
    await user.type(screen.getByLabelText('Confirm password'), 'Password123');
    await user.click(screen.getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Email already exists')).toBeInTheDocument();
  });

  it('clears field error when user types in field with error', async () => {
    const user = userEvent.setup();

    render(
      <SignupForm onSwitchToLogin={vi.fn()} onAuthSuccess={vi.fn()} />
    );

    // First trigger validation error
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Username is required')).toBeInTheDocument();

    // Now type in the field with error
    await user.type(screen.getByLabelText('Username'), 'NewUser');

    // Error should be cleared
    expect(screen.queryByText('Username is required')).not.toBeInTheDocument();
  });
});
