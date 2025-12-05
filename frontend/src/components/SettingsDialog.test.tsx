import '@/test/mockMotion';
import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsDialog } from './SettingsDialog';

describe('SettingsDialog', () => {
  const user = { id: 1, email: 'user@example.com', username: 'User', date_joined: '' };

  it('renders profile information and allows editing', async () => {
    const userActions = userEvent.setup();

    render(<SettingsDialog user={user} open={true} onOpenChange={vi.fn()} />);

    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInput = screen.getByLabelText('Email Address') as HTMLInputElement;

    expect(nameInput.value).toBe('User');
    expect(emailInput.value).toBe('user@example.com');

    await userActions.clear(nameInput);
    await userActions.type(nameInput, 'Updated User');

    expect(nameInput.value).toBe('Updated User');
  });

  it('switches between tabs', async () => {
    const userActions = userEvent.setup();

    render(<SettingsDialog user={user} open={true} onOpenChange={vi.fn()} />);

    await userActions.click(screen.getByText('Appearance'));
    expect(screen.getByText('Theme')).toBeInTheDocument();

    await userActions.click(screen.getByText('Privacy'));
    expect(screen.getByText('Privacy & Security')).toBeInTheDocument();
  });

  it('toggles preference switches', async () => {
    const userActions = userEvent.setup();

    render(<SettingsDialog user={user} open={true} onOpenChange={vi.fn()} />);

    await userActions.click(screen.getByText('Appearance'));

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);

    const initialStates = switches.map(switchEl => (switchEl as HTMLInputElement).checked);
    await userActions.click(switches[0]);

    expect((switches[0] as HTMLInputElement).checked).toBe(!initialStates[0]);
  });

  it('updates theme option styling when selected', async () => {
    const userActions = userEvent.setup();

    render(<SettingsDialog user={user} open={true} onOpenChange={vi.fn()} />);

    await userActions.click(screen.getByText('Appearance'));

    const lightOption = screen.getByText('Light').parentElement as HTMLElement;
    const darkOption = screen.getByText('Dark').parentElement as HTMLElement;

    expect(darkOption.className).toContain('border-primary');
    expect(lightOption.className).not.toContain('border-primary');

    await userActions.click(lightOption);

    expect(lightOption.className).toContain('border-primary');
  });

  it('calls onOpenChange when saving changes', async () => {
    const userActions = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<SettingsDialog user={user} open={true} onOpenChange={onOpenChange} />);

    await userActions.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
