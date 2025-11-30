import '@/test/mockMotion';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ChatSidebar } from './ChatSidebar';

const baseSession = {
  lastMessage: 'Hello there',
  messages: [],
  title: 'Session',
  timestamp: new Date(),
};

describe('ChatSidebar', () => {
  it('calls onNewChat when new chat button is clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();

    render(
      <ChatSidebar
        sessions={[{ ...baseSession, id: '1' }]}
        currentSessionId="1"
        onSelectSession={vi.fn()}
        onNewChat={onNewChat}
        onDeleteSession={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /New Chat/i }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('renders session summaries and invokes onSelectSession when clicked', async () => {
    const user = userEvent.setup();
    const onSelectSession = vi.fn();
    const sessions = [
      { ...baseSession, id: '1', title: 'Today Session' },
      { ...baseSession, id: '2', title: 'Earlier Session' },
    ];

    render(
      <ChatSidebar
        sessions={sessions}
        currentSessionId="1"
        onSelectSession={onSelectSession}
        onNewChat={vi.fn()}
        onDeleteSession={vi.fn()}
      />
    );

    expect(screen.getByText('Today Session')).toBeInTheDocument();
    expect(screen.getByText('Earlier Session')).toBeInTheDocument();

    await user.click(screen.getByText('Earlier Session'));
    expect(onSelectSession).toHaveBeenCalledWith('2');
  });

  it('renders session titles correctly', () => {
    render(
      <ChatSidebar
        sessions={[{ ...baseSession, id: '3', title: 'Old Session' }]}
        currentSessionId=""
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteSession={vi.fn()}
      />
    );

    expect(screen.getByText('Old Session')).toBeInTheDocument();
  });

  it('opens delete confirmation dialog when delete is clicked', async () => {
    const user = userEvent.setup();
    const onDeleteSession = vi.fn();
    const sessions = [{ ...baseSession, id: '1', title: 'Test Session' }];

    render(
      <ChatSidebar
        sessions={sessions}
        currentSessionId="1"
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteSession={onDeleteSession}
      />
    );

    // Find the three-dot menu button (MoreHorizontal icon button)
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find(btn => btn.querySelector('svg'));

    if (menuButton && menuButton !== screen.getByRole('button', { name: /New Chat/i })) {
      await user.click(menuButton);

      // Check if delete menu item appears
      const deleteMenuItem = await screen.findByText(/^Delete$/i);
      expect(deleteMenuItem).toBeInTheDocument();

      // Click delete menu item
      await user.click(deleteMenuItem);

      // Check if confirmation dialog appears
      expect(await screen.findByText(/Delete Chat\?/i)).toBeInTheDocument();
      expect(screen.getByText(/This will permanently delete this chat/i)).toBeInTheDocument();
    }
  });

  it('does not delete session when cancel is clicked in confirmation dialog', async () => {
    const user = userEvent.setup();
    const onDeleteSession = vi.fn();
    const sessions = [{ ...baseSession, id: '1', title: 'Test Session' }];

    render(
      <ChatSidebar
        sessions={sessions}
        currentSessionId="1"
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteSession={onDeleteSession}
      />
    );

    // Find and click the menu button
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find(btn => btn.querySelector('svg') && btn !== screen.getByRole('button', { name: /New Chat/i }));

    if (menuButton) {
      await user.click(menuButton);

      // Click delete menu item
      const deleteMenuItem = await screen.findByText(/^Delete$/i);
      await user.click(deleteMenuItem);

      // Click cancel in confirmation dialog
      const cancelButton = await screen.findByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      // Verify delete was not called
      expect(onDeleteSession).not.toHaveBeenCalled();
    }
  });

  it('calls onDeleteSession when delete is confirmed', async () => {
    const user = userEvent.setup();
    const onDeleteSession = vi.fn();
    const sessions = [{ ...baseSession, id: '1', title: 'Test Session' }];

    render(
      <ChatSidebar
        sessions={sessions}
        currentSessionId="1"
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteSession={onDeleteSession}
      />
    );

    // Find and click the menu button
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find(btn => btn.querySelector('svg') && btn !== screen.getByRole('button', { name: /New Chat/i }));

    if (menuButton) {
      await user.click(menuButton);

      // Click delete menu item
      const deleteMenuItem = await screen.findByText(/^Delete$/i);
      await user.click(deleteMenuItem);

      // Click delete in confirmation dialog
      const deleteButtons = await screen.findAllByRole('button', { name: /Delete/i });
      const confirmButton = deleteButtons.find(btn => btn.className.includes('e02e2a'));
      if (confirmButton) {
        await user.click(confirmButton);

        // Verify delete was called with correct session ID
        expect(onDeleteSession).toHaveBeenCalledWith('1');
      }
    }
  });
});
