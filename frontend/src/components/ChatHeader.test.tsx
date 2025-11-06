import '@/test/mockMotion';
import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const recorderMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  getSources: vi.fn(),
  chooseSource: vi.fn(),
  init: vi.fn(),
}));

vi.mock('@/recording/provider', () => ({
  useRecorder: () => recorderMocks,
}));

import { ChatHeader } from './ChatHeader';

const baseUser = { id: 1, email: 'user@example.com', username: 'Test User', date_joined: '' };

beforeEach(() => {
  recorderMocks.start.mockClear();
  recorderMocks.stop.mockClear();
  recorderMocks.getSources.mockClear();
  recorderMocks.chooseSource.mockClear();
  recorderMocks.init.mockClear();
  recorderMocks.start.mockResolvedValue(undefined);
  recorderMocks.stop.mockResolvedValue({
    blob: new Blob(['test']),
    mimeType: 'video/webm',
    durationMs: 1200,
    width: 1920,
    height: 1080,
    startedAt: Date.now(),
    endedAt: Date.now(),
    objectUrl: 'blob://video',
  });
  recorderMocks.getSources.mockResolvedValue([
    { id: '1', name: 'Screen 1' },
    { id: '2', name: 'Window' },
  ]);
  recorderMocks.chooseSource.mockResolvedValue(undefined);
});

describe('ChatHeader', () => {
  it('renders current session info and toggles sidebar', async () => {
    const onToggleSidebar = vi.fn();
    render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={true}
        onToggleSidebar={onToggleSidebar}
        currentSession={{
          id: '1',
          title: 'Weekly Sync',
          lastMessage: 'See you soon',
          timestamp: new Date(),
          messages: [{ id: 'm1', content: 'hello', isUser: true, timestamp: new Date() }],
        }}
      />
    );

    const toggleButton = screen.getAllByRole('button')[0];
    await userEvent.click(toggleButton);
    expect(onToggleSidebar).toHaveBeenCalled();
    expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
    expect(screen.getByText('1 messages')).toBeInTheDocument();
  });

  it('handles recording start and stop flow with source selection', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(recorderMocks.getSources).toHaveBeenCalled();
    expect(recorderMocks.chooseSource).toHaveBeenCalledWith('1');
    expect(recorderMocks.start).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(recorderMocks.stop).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('blob://video', '_blank');

    openSpy.mockRestore();
  });

  it('opens settings dialog and triggers sign out', async () => {
    const onSignOut = vi.fn();

    render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
        onSignOut={onSignOut}
      />
    );

    const avatarButton = screen.getAllByRole('button').find((btn) => btn.className?.includes('rounded-full'));
    expect(avatarButton).toBeTruthy();
    await userEvent.click(avatarButton!);

    const settingsButtons = screen.getAllByRole('button', { name: 'Settings' });
    await userEvent.click(settingsButtons[settingsButtons.length - 1]);
    await userEvent.click(screen.getByText('Sign Out'));

    expect(onSignOut).toHaveBeenCalled();
  });
});
