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
};

describe('ChatSidebar', () => {
  it('calls onNewChat when new chat button is clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();

    render(
      <ChatSidebar
        sessions={[{ ...baseSession, id: '1', timestamp: new Date() }]}
        currentSessionId="1"
        onSelectSession={vi.fn()}
        onNewChat={onNewChat}
      />
    );

    await user.click(screen.getByRole('button', { name: /New Chat/i }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('renders session summaries and invokes onSelectSession when clicked', async () => {
    const user = userEvent.setup();
    const onSelectSession = vi.fn();
    const sessions = [
      { ...baseSession, id: '1', title: 'Today Session', timestamp: new Date() },
      { ...baseSession, id: '2', title: 'Earlier Session', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    ];

    render(
      <ChatSidebar
        sessions={sessions}
        currentSessionId="1"
        onSelectSession={onSelectSession}
        onNewChat={vi.fn()}
      />
    );

    expect(screen.getByText('Today Session')).toBeInTheDocument();
    expect(screen.getByText('Earlier Session')).toBeInTheDocument();
    expect(screen.getByText('Just now')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();

    await user.click(screen.getByText('Earlier Session'));
    expect(onSelectSession).toHaveBeenCalledWith('2');
  });

  it('formats timestamps for older sessions', () => {
    const olderDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    render(
      <ChatSidebar
        sessions={[{ ...baseSession, id: '3', title: 'Old Session', timestamp: olderDate }]}
        currentSessionId=""
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
      />
    );

    expect(screen.getByText('Old Session')).toBeInTheDocument();
    expect(screen.getByText(olderDate.toLocaleDateString())).toBeInTheDocument();
  });
});
