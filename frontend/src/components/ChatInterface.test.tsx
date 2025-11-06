import '@/test/mockMotion';
import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { act } from 'react';

const llmMocks = vi.hoisted(() => ({
  streamMessageMock: vi.fn(),
  stopStreamingMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/llm', () => ({
  llmService: {
    streamMessage: llmMocks.streamMessageMock,
    stopStreaming: llmMocks.stopStreamingMock,
  },
}));

const { streamMessageMock } = llmMocks;

let setDownloadDialogOpen: ((open: boolean) => void) | undefined;
let lastDialogOpen = false;

vi.mock('./ModelDownloadDialog', () => ({
  ModelDownloadDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
    lastDialogOpen = open;
    setDownloadDialogOpen = onOpenChange;
    return <div data-testid="download-dialog" data-open={open} />;
  },
}));

let lastMessagesProp: any[] = [];

vi.mock('./ChatMessages', () => ({
  ChatMessages: ({ messages }: { messages: any[] }) => {
    lastMessagesProp = messages;
    return <div data-testid="chat-messages" data-count={messages.length}>{messages.map(msg => msg.content).join('|')}</div>;
  },
}));

let sendMessageHandler: ((message: string) => void) | undefined;
let lastInputDisabled = true;

vi.mock('./ChatInput', () => ({
  ChatInput: ({
    onSendMessage,
    onStop,
    runState,
    inputDisabled,
  }: {
    onSendMessage: (message: string) => void;
    onStop?: () => void;
    runState: string;
    inputDisabled?: boolean;
  }) => {
    sendMessageHandler = onSendMessage;
    lastInputDisabled = Boolean(inputDisabled);
    return <div data-testid="chat-input" data-disabled={inputDisabled} data-run-state={runState} />;
  },
}));

vi.mock('./ChatSidebar', () => ({
  ChatSidebar: () => <div data-testid="chat-sidebar" />,
}));

vi.mock('./ChatHeader', () => ({
  ChatHeader: () => <div data-testid="chat-header" />,
}));

import { ChatInterface } from './ChatInterface';

describe('ChatInterface', () => {
  let checkModelDownloadedMock: ReturnType<typeof vi.fn>;
  let modelNotFoundHandler: (() => void) | undefined;
  let llmReadyHandler: (() => void) | undefined;
  let llmErrorHandler: ((error: any) => void) | undefined;

  beforeEach(() => {
    streamMessageMock.mockReset();
    llmMocks.stopStreamingMock.mockReset();
    setDownloadDialogOpen = undefined;
    lastDialogOpen = false;
    lastMessagesProp = [];
    sendMessageHandler = undefined;
    lastInputDisabled = true;
    modelNotFoundHandler = undefined;
    llmReadyHandler = undefined;
    llmErrorHandler = undefined;

    checkModelDownloadedMock = vi.fn();

    (window as any).llmAPI = {
      checkModelDownloaded: checkModelDownloadedMock,
      onModelNotFound: (handler: () => void) => {
        modelNotFoundHandler = handler;
      },
      onLLMReady: (handler: () => void) => {
        llmReadyHandler = handler;
      },
      onLLMError: (handler: (error: any) => void) => {
        llmErrorHandler = handler;
      },
      onDownloadProgress: vi.fn(),
      onDownloadComplete: vi.fn(),
      onDownloadError: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows download dialog when model is not downloaded', async () => {
    checkModelDownloadedMock.mockResolvedValue({ downloaded: false, initialized: false });

    render(<ChatInterface user={null} />);

    await waitFor(() => {
      expect(checkModelDownloadedMock).toHaveBeenCalled();
      expect(lastDialogOpen).toBe(true);
      expect(lastInputDisabled).toBe(true);
    });
  });

  it('enables input when model is ready', async () => {
    checkModelDownloadedMock.mockResolvedValue({ downloaded: true, initialized: true });

    render(<ChatInterface user={null} />);

    await waitFor(() => {
      expect(lastInputDisabled).toBe(false);
    });
  });

  it('updates dialog visibility in response to model events', async () => {
    checkModelDownloadedMock.mockResolvedValue({ downloaded: true, initialized: false });

    render(<ChatInterface user={null} />);

    expect(modelNotFoundHandler).toBeDefined();
    expect(llmReadyHandler).toBeDefined();
    expect(llmErrorHandler).toBeDefined();

    await waitFor(() => {
      expect(lastDialogOpen).toBe(false);
    });

    await act(async () => {
      modelNotFoundHandler?.();
    });
    await waitFor(() => {
      expect(lastDialogOpen).toBe(true);
    });

    await act(async () => {
      llmReadyHandler?.();
    });
    await waitFor(() => {
      expect(lastDialogOpen).toBe(false);
    });

    await act(async () => {
      llmErrorHandler?.({ message: 'error' });
    });
    expect(lastDialogOpen).toBe(false);
  });

  it('streams chat responses and updates messages', async () => {
    checkModelDownloadedMock.mockResolvedValue({ downloaded: true, initialized: true });

    streamMessageMock.mockImplementation(async (_message: string, onChunk: (chunk: string) => void) => {
      onChunk('Hello there');
    });

    render(<ChatInterface user={null} />);

    await waitFor(() => {
      expect(lastInputDisabled).toBe(false);
      expect(sendMessageHandler).toBeDefined();
    });

    await waitFor(() => {
      expect(lastMessagesProp.length).toBeGreaterThan(0);
    });

    await act(async () => {
      await sendMessageHandler?.('User message');
    });

    await waitFor(() => {
      expect(streamMessageMock).toHaveBeenCalledWith(
        'User message',
        expect.any(Function),
        expect.objectContaining({ temperature: 0.7 })
      );
      const latestAiMessage = lastMessagesProp[lastMessagesProp.length - 1];
      expect(latestAiMessage.content).toContain('Hello there');
    });
  });

  it('handles not-initialized errors by showing download dialog', async () => {
    checkModelDownloadedMock.mockResolvedValue({ downloaded: true, initialized: true });
    streamMessageMock.mockRejectedValue(new Error('LLM not initialized yet'));

    render(<ChatInterface user={null} />);

    await waitFor(() => {
      expect(lastInputDisabled).toBe(false);
      expect(sendMessageHandler).toBeDefined();
    });

    await act(async () => {
      await sendMessageHandler?.('Trigger error');
    });

    await waitFor(() => {
      expect(lastDialogOpen).toBe(true);
      expect(lastMessagesProp[lastMessagesProp.length - 1].content).toContain('not initialized yet');
    });
  });
});
