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
  useChunkedEmbeddingQueue: vi.fn(),
  onEmbeddedChunkCallback: null as ((data: any) => Promise<void>) | null,
}));

const memoryServiceMocks = vi.hoisted(() => ({
  storeVideoEmbedding: vi.fn(),
}));

vi.mock('@/services/memory', () => ({
  memoryService: {
    storeVideoEmbedding: memoryServiceMocks.storeVideoEmbedding,
  },
}));

vi.mock('@/recording/provider', () => ({
  useRecorder: () => ({
    isRecording: false,
    startRecording: recorderMocks.start,
    stopRecording: recorderMocks.stop,
    getSources: recorderMocks.getSources,
    chooseSource: recorderMocks.chooseSource,
    recordingTime: 0,
  }),
  useRecording: () => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    recordingTime: 0,
  }),
  useChunkedEmbeddingQueue: (options: any) => {
    if (options?.onEmbeddedChunk) {
      recorderMocks.onEmbeddedChunkCallback = options.onEmbeddedChunk;
    }
    return recorderMocks.useChunkedEmbeddingQueue(options);
  },
}));

import { ChatHeader } from './ChatHeader';

const baseUser = { id: 1, email: 'user@example.com', username: 'Test User', date_joined: '' };

beforeEach(() => {
  recorderMocks.start.mockClear();
  recorderMocks.stop.mockClear();
  recorderMocks.getSources.mockClear();
  recorderMocks.chooseSource.mockClear();
  recorderMocks.init.mockClear();
  recorderMocks.onEmbeddedChunkCallback = null;
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
  recorderMocks.useChunkedEmbeddingQueue.mockReturnValue({
    isRecording: false,
    isProcessing: false,
    startChunked: async () => { await recorderMocks.start(); },
    stopChunked: async () => { await recorderMocks.stop(); },
  });

  memoryServiceMocks.storeVideoEmbedding.mockClear();
  memoryServiceMocks.storeVideoEmbedding.mockResolvedValue(undefined);
});

describe('ChatHeader', () => {
  it('renders current session info and toggles sidebar', async () => {
    const onToggleSidebar = vi.fn();
    render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
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
    const { rerender } = render(
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

    expect(recorderMocks.start).toHaveBeenCalled();

    recorderMocks.useChunkedEmbeddingQueue.mockReturnValue({
      isRecording: true,
      isProcessing: false,
      startChunked: async () => { await recorderMocks.start(); },
      stopChunked: async () => { await recorderMocks.stop(); },
    });

    rerender(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(recorderMocks.stop).toHaveBeenCalled();
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

  it('handles video embedding storage successfully', async () => {
    render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />
    );

    // Verify callback was registered
    expect(recorderMocks.onEmbeddedChunkCallback).toBeDefined();

    // Simulate a video chunk being embedded
    if (recorderMocks.onEmbeddedChunkCallback) {
      await recorderMocks.onEmbeddedChunkCallback({
        chunk: {
          blob: new Blob(['video-data']),
          durationMs: 5000,
          width: 1920,
          height: 1080,
        },
        pooled: new Float32Array([0.1, 0.2, 0.3]),
      });

      expect(memoryServiceMocks.storeVideoEmbedding).toHaveBeenCalledWith(
        expect.any(Float32Array),
        expect.any(Blob),
        {
          duration: 5000,
          width: 1920,
          height: 1080,
        }
      );
    }
  });

  it('handles video embedding storage errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    memoryServiceMocks.storeVideoEmbedding.mockRejectedValueOnce(new Error('Storage failed'));

    render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />
    );

    // Simulate a video chunk being embedded that fails
    if (recorderMocks.onEmbeddedChunkCallback) {
      await recorderMocks.onEmbeddedChunkCallback({
        chunk: {
          blob: new Blob(['video-data']),
          durationMs: 5000,
          width: 1920,
          height: 1080,
        },
        pooled: new Float32Array([0.1, 0.2, 0.3]),
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[video upload] failed:',
        expect.any(Error)
      );
    }

    consoleErrorSpy.mockRestore();
  });

  it('handles recording start errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    recorderMocks.useChunkedEmbeddingQueue.mockReturnValue({
      isRecording: false,
      isProcessing: false,
      startChunked: async () => { throw new Error('Start failed'); },
      stopChunked: async () => { await recorderMocks.stop(); },
    });

    render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /start/i }));

    // Should log the error
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('handles recording stop errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    recorderMocks.useChunkedEmbeddingQueue.mockReturnValue({
      isRecording: true,
      isProcessing: false,
      startChunked: async () => { await recorderMocks.start(); },
      stopChunked: async () => { throw new Error('Stop failed'); },
    });

    const { rerender } = render(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />
    );

    rerender(
      <ChatHeader
        user={baseUser}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /stop/i }));

    // Should log the error
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[recording] stopChunked failed:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
