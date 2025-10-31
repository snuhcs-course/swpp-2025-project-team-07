import '@/test/mockMotion';
import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ForgotPasswordForm } from './ForgotPasswordForm';

describe('ForgotPasswordForm', () => {
  it('shows success state after submitting valid email', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const setTimeoutMock = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: any, ms?: number) => {
      if (typeof ms === 'number' && ms >= 1000 && typeof cb === 'function') {
        queueMicrotask(() => cb());
        return 0 as any;
      }
      return originalSetTimeout(cb as any, ms as any);
    });
    const user = userEvent.setup();

    render(<ForgotPasswordForm onSwitchToLogin={vi.fn()} />);

    await user.type(screen.getByLabelText('Email address'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /Send reset link/i }));

    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/user@example.com/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Resend email/i }));

    setTimeoutMock.mockRestore();
  });

  it('invokes onSwitchToLogin when returning to sign in', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const setTimeoutMock = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb: any, ms?: number) => {
      if (typeof ms === 'number' && ms >= 1000 && typeof cb === 'function') {
        queueMicrotask(() => cb());
        return 0 as any;
      }
      return originalSetTimeout(cb as any, ms as any);
    });
    const user = userEvent.setup();
    const onSwitchToLogin = vi.fn();

    render(<ForgotPasswordForm onSwitchToLogin={onSwitchToLogin} />);

    // Enter valid email to reach success state
    await user.type(screen.getByLabelText('Email address'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /Send reset link/i }));

    await user.click(screen.getAllByRole('button', { name: /Back to sign in/i })[0]);
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);

    setTimeoutMock.mockRestore();
  });
});
