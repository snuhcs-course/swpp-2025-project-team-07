import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { requestPasswordReset, confirmPasswordReset } from '@/services/auth';
import { vi } from 'vitest';

// Mock auth service
vi.mock('@/services/auth', () => ({
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

describe('ForgotPasswordForm', () => {
  const mockOnSwitchToLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email form initially', () => {
    render(<ForgotPasswordForm onSwitchToLogin={mockOnSwitchToLogin} />);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send code/i })).toBeInTheDocument();
  });

  it.only('validates email input', async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm onSwitchToLogin={mockOnSwitchToLogin} />);
    
    const submitBtn = screen.getByRole('button', { name: /send code/i });
    await user.click(submitBtn);
    
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    
    const emailInput = screen.getByLabelText('Email address');
    await user.type(emailInput, 'invalid-email');
    await user.click(submitBtn);
    
    screen.debug();
    expect(await screen.findByText('Please enter a valid email')).toBeInTheDocument();
  });

  it('switches to OTP form after successful email submission', async () => {
    const user = userEvent.setup();
    (requestPasswordReset as any).mockResolvedValue({ message: 'OTP sent' });
    
    render(<ForgotPasswordForm onSwitchToLogin={mockOnSwitchToLogin} />);
    
    const emailInput = screen.getByLabelText('Email address');
    await user.type(emailInput, 'test@example.com');
    
    const submitBtn = screen.getByRole('button', { name: /send code/i });
    await user.click(submitBtn);
    
    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith('test@example.com');
    });
    
    await waitFor(() => {
      expect(screen.getByLabelText('6-Digit Code')).toBeInTheDocument();
      expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    });
  });

  it('handles OTP submission and resets password', async () => {
    const user = userEvent.setup();
    // Start at OTP step
    (requestPasswordReset as any).mockResolvedValue({ message: 'OTP sent' });
    render(<ForgotPasswordForm onSwitchToLogin={mockOnSwitchToLogin} />);
    
    const emailInput = screen.getByLabelText('Email address');
    await user.type(emailInput, 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    
    await waitFor(() => {
      expect(screen.getByLabelText('6-Digit Code')).toBeInTheDocument();
    });

    // Fill OTP form
    await user.type(screen.getByLabelText('6-Digit Code'), '123456');
    await user.type(screen.getByLabelText('New Password'), 'NewPass123');
    await user.type(screen.getByLabelText('Confirm Password'), 'NewPass123');
    
    (confirmPasswordReset as any).mockResolvedValue({ message: 'Success' });
    
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    
    await waitFor(() => {
      expect(confirmPasswordReset).toHaveBeenCalledWith('test@example.com', '123456', 'NewPass123');
      expect(screen.getByText('Password reset successfully!')).toBeInTheDocument();
    });
    
    // Check redirection
    await waitFor(() => {
      expect(mockOnSwitchToLogin).toHaveBeenCalled();
    }, { timeout: 3000 });
  });
});
