import '@/test/mockMotion';
import React, { useEffect } from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, waitFor, act, screen } from '@testing-library/react';

const llmMocks = vi.hoisted(() => ({
  streamMessageMock: vi.fn(),
  stopStreamingMock: vi.fn(),
  createSessionMock: vi.fn(),
  generateTitleMock: vi.fn().mockResolvedValue('Generated Title'),
}));

import { ChatInterface } from './ChatInterface';

vi.mock('@/services/llm', () => ({
  llmService: {
    streamMessage: llmMocks.streamMessageMock,
    stopStreaming: llmMocks.stopStreamingMock,
    createSession: llmMocks.createSessionMock,
    generateTitle: llmMocks.generateTitleMock,
  },
}));

const chatServiceMocks = vi.hoisted(() => ({
  fetchSessions: vi.fn(),
  fetchSession: vi.fn(),
  createSession: vi.fn(),
  sendMessage: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('@/services/chat', () => ({
  chatService: chatServiceMocks,
}));

const embeddingMocks = vi.hoisted(() => ({
  embedQuery: vi.fn(),
  embedVideoQuery: vi.fn(),
}));

vi.mock('@/services/embedding', () => ({
  embeddingService: embeddingMocks,
}));

const collectionMocks = vi.hoisted(() => ({
  searchAndQuery: vi.fn(),
}));

vi.mock('@/services/collection', () => ({
  collectionService: collectionMocks,
}));

const memoryMocks = vi.hoisted(() => ({
  trackMessage: vi.fn(),
  searchSimilar: vi.fn(),
}));

vi.mock('@/services/memory', () => ({
  memoryService: memoryMocks,
}));

const processingMocks = vi.hoisted(() => ({
  startPhase: vi.fn(),
  completePhase: vi.fn(),
  completeProcessing: vi.fn(),
  tokensStarted: vi.fn(),
  setMetrics: vi.fn(),
  reset: vi.fn(),
  fail: vi.fn(),
}));

vi.mock('@/services/processing-status', () => ({
  processingStatusService: processingMocks,
}));

const samplerMocks = vi.hoisted(() => ({
  sampleUniformFramesAsBase64: vi.fn(),
  sampleUniformFrames: vi.fn(),
}));

vi.mock('@/embedding/video-sampler', () => samplerMocks);

const frameExtractorMocks = vi.hoisted(() => ({
  extractFramesFromVideoBlob: vi.fn(),
  displayFramesInConsole: vi.fn(),
  openFramesInWindow: vi.fn(),
}));

vi.mock('@/utils/frame-extractor-browser', () => frameExtractorMocks);

let lastMessages: any[] = [];
let sendMessageHandler: ((message: string) => void) | undefined;
let stopHandler: (() => void) | undefined;
let lastGenerateWithVideos: (() => void) | undefined;
let lastSelectedIds: string[] = [];
let lastDialogOpen = false;
let lastJoyrideCallback: ((data: any) => void) | undefined;

vi.mock('./ChatHeader', () => ({
  ChatHeader: () => <div data-testid="chat-header" />,
}));

vi.mock('./ChatSidebar', () => ({
  ChatSidebar: () => <div data-testid="chat-sidebar" />,
}));

vi.mock('./ChatMessages', () => ({
  ChatMessages: ({ messages, statusIndicator }: { messages: any[]; statusIndicator?: React.ReactNode }) => {
    lastMessages = messages;
    return (
      <div data-testid="chat-messages" data-count={messages.length}>
        {statusIndicator}
      </div>
    );
  },
}));

vi.mock('./ChatInput', () => ({
  ChatInput: ({
    onSendMessage,
    onStop,
    runState,
    videoRagEnabled,
  }: any) => {
    sendMessageHandler = onSendMessage;
    stopHandler = onStop;
    return (
      <div
        data-testid="chat-input"
        data-run={runState}
        data-video-rag={videoRagEnabled}
      />
    );
  },
}));

vi.mock('./ChatStatusIndicators', () => ({
  ChatStatusIndicators: ({
    showVideoGrid,
    onGenerateWithSelectedVideos,
    selectedVideoIds,
    onToggleVideoSelection,
    videoCandidates,
  }: any) => {
    lastSelectedIds = selectedVideoIds;
    useEffect(() => {
      if (!showVideoGrid) return;
      if (videoCandidates?.length) {
        onToggleVideoSelection(videoCandidates[0].id);
      }
      const timeout = setTimeout(() => onGenerateWithSelectedVideos(), 0);
      return () => clearTimeout(timeout);
    }, [showVideoGrid, videoCandidates, onGenerateWithSelectedVideos, onToggleVideoSelection]);
    lastGenerateWithVideos = onGenerateWithSelectedVideos;
    return <div data-testid="chat-status" data-show-grid={showVideoGrid} />;
  },
  StopIndicator: () => <div data-testid="stop-indicator" />,
}));

vi.mock('./ModelDownloadDialog', () => ({
  ModelDownloadDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
    lastDialogOpen = open;
    return <div data-testid="download-dialog" data-open={open} onClick={() => onOpenChange(!open)} />;
  },
}));

vi.mock('./VideoPlayerModal', () => ({
  VideoPlayerModal: () => <div data-testid="video-player" />,
}));

vi.mock('react-joyride', () => ({
  default: ({ run, callback }: any) => {
    lastJoyrideCallback = callback;
    return <div data-testid="joyride" data-run={run} />;
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

describe('ChatInterface', () => {
  let checkModelDownloadedMock: ReturnType<typeof vi.fn>;
  let llmReadyHandler: (() => void) | undefined;

  beforeEach(() => {
    checkModelDownloadedMock = vi.fn().mockResolvedValue({ downloaded: true, initialized: true });
    llmReadyHandler = undefined;
    lastDialogOpen = false;
    lastMessages = [];
    sendMessageHandler = undefined;
    stopHandler = undefined;
    lastGenerateWithVideos = undefined;
    lastSelectedIds = [];
    lastJoyrideCallback = undefined;
    (window as any).__ragPrompt = undefined;
    localStorage.clear();
    localStorage.setItem('videoRagEnabled', 'false');
    (global as any).URL.createObjectURL = vi.fn(() => 'blob:preview');
    (global as any).URL.revokeObjectURL = vi.fn();
    (global as any).navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };
    (window as any).open = vi.fn(() => ({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    }));

    (window as any).llmAPI = {
      checkModelDownloaded: checkModelDownloadedMock,
      onModelNotFound: vi.fn(),
      onLLMReady: (handler: () => void) => {
        llmReadyHandler = handler;
      },
      onLLMError: vi.fn(),
    };

    llmMocks.streamMessageMock.mockReset().mockImplementation(async (_message, onToken) => {
      onToken?.('chunk');
      return 'chunk';
    });
    llmMocks.stopStreamingMock.mockReset().mockResolvedValue(undefined);
    llmMocks.createSessionMock.mockReset();

    chatServiceMocks.fetchSessions.mockReset().mockResolvedValue([]);
    chatServiceMocks.fetchSession.mockReset();
    chatServiceMocks.createSession.mockReset().mockResolvedValue({
      id: 1,
      title: 'New Conversation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_message_timestamp: Date.now(),
      messages: [],
    });
    chatServiceMocks.sendMessage.mockReset().mockImplementation(async (sessionId: number, role: string, content: string) => ({
      id: Date.now(),
      session: sessionId,
      role,
      content,
      timestamp: Date.now(),
      created_at: new Date().toISOString(),
    }));
    chatServiceMocks.deleteSession.mockReset().mockResolvedValue(undefined);
    chatServiceMocks.updateSession.mockReset().mockResolvedValue(undefined);

    embeddingMocks.embedQuery.mockReset().mockResolvedValue(new Float32Array(4).fill(0.1));
    embeddingMocks.embedVideoQuery.mockReset().mockResolvedValue(new Float32Array(4).fill(0.2));

    collectionMocks.searchAndQuery.mockReset().mockResolvedValue([]);
    memoryMocks.trackMessage.mockReset().mockResolvedValue(undefined);

    Object.values(processingMocks).forEach(fn => fn.mockReset && fn.mockReset());

    samplerMocks.sampleUniformFramesAsBase64.mockReset().mockResolvedValue([
      { time: 0, base64: 'frame-base64' },
    ]);
    samplerMocks.sampleUniformFrames.mockReset().mockResolvedValue([]);
    frameExtractorMocks.extractFramesFromVideoBlob.mockReset().mockResolvedValue([{ time: 0, dataUrl: 'x' }]);
    frameExtractorMocks.displayFramesInConsole.mockReset();
    frameExtractorMocks.openFramesInWindow.mockReset();
  });

  afterEach(() => {
  });

  it('shows download dialog when models are missing and hides after ready event', async () => {
    checkModelDownloadedMock.mockResolvedValueOnce({ downloaded: false, initialized: false });

    render(<ChatInterface user={null} />);

    await new Promise(resolve => setTimeout(resolve, 1200));

    await waitFor(() => {
      expect(lastDialogOpen).toBe(true);
    }, { timeout: 5000 });

    await act(async () => {
      llmReadyHandler?.();
    });

    await waitFor(() => {
      expect(lastDialogOpen).toBe(false);
    }, { timeout: 5000 });
  }, 15000);

  it('runs chat flow with retrieved context and streaming', async () => {
    collectionMocks.searchAndQuery.mockResolvedValue([
      {
        id: 'doc1',
        content: 'user: hi\nassistant: hello',
        source_type: 'chat',
        metadata: {},
      },
    ]);

    render(<ChatInterface user={null} />);

    await new Promise(resolve => setTimeout(resolve, 1200));

    await waitFor(() => {
      expect(sendMessageHandler).toBeDefined();
    }, { timeout: 5000 });

    await act(async () => {
      sendMessageHandler?.('Hello world');
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    await waitFor(() => {
      expect(llmMocks.streamMessageMock).toHaveBeenCalled();
      expect(chatServiceMocks.createSession).toHaveBeenCalledWith('New Conversation');
    }, { timeout: 5000 });

    expect(processingMocks.startPhase).toHaveBeenCalledWith(expect.any(String), 'searching');
    expect(processingMocks.completePhase).toHaveBeenCalledWith(expect.any(String), 'generating', expect.any(Number), expect.any(Object));
    expect(memoryMocks.trackMessage).toHaveBeenCalled();
    expect(window).toHaveProperty('__ragPrompt');
    expect((window as any).__ragPrompt.contextAdded).toBe(true);

    await waitFor(() => {
      expect(lastMessages.some(msg => msg.content?.includes('chunk'))).toBe(true);
    });
  }, 15000);

  it('handles video RAG selection and sends sampled frames to the LLM', async () => {
    localStorage.setItem('videoRagEnabled', 'true');

    const videoBlob = new Blob(['video'], { type: 'video/webm' });
    collectionMocks.searchAndQuery.mockResolvedValue([
      {
        id: 'doc-chat',
        content: 'user: remember this\nassistant: sure thing',
        source_type: 'chat',
        metadata: {},
      },
      {
        id: 'video-set',
        content: 'Screen recording',
        source_type: 'screen',
        video_blob: videoBlob,
        video_set_videos: [
          { id: 'v1', video_blob: videoBlob, duration: 1000, timestamp: 1 },
        ],
        metadata: { duration: 1000, width: 640, height: 480 },
      },
    ]);

    render(<ChatInterface user={null} />);

    await new Promise(resolve => setTimeout(resolve, 1200));

    await waitFor(() => {
      expect(sendMessageHandler).toBeDefined();
    }, { timeout: 5000 });

    await act(async () => {
      sendMessageHandler?.('Show me my screen');
    });

    await waitFor(() => {
      expect(llmMocks.streamMessageMock).toHaveBeenCalled();
    }, { timeout: 10000 });

    expect(samplerMocks.sampleUniformFramesAsBase64).toHaveBeenCalledWith(videoBlob, 1, expect.objectContaining({ keepOriginal: true }));
    const [, , options] = llmMocks.streamMessageMock.mock.calls.at(-1) || [];
    expect(options.images).toEqual(['frame-base64']);
  }, 20000);

  it('completes onboarding tour when joyride finishes', async () => {
    render(<ChatInterface user={null} />);

    await waitFor(() => {
      expect(screen.getByTestId('joyride').dataset.run).toBe('true');
    });

    act(() => {
      lastJoyrideCallback?.({ status: 'finished' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('joyride').dataset.run).toBe('false');
      expect(localStorage.getItem('onboarding_completed')).toBe('true');
    });
  });

  it('supports cancelling a run before any tokens arrive', async () => {
    let resolveStream: ((value?: string) => void) | undefined;
    llmMocks.streamMessageMock.mockImplementation((_message, _onToken) => {
      return new Promise<string>(resolve => {
        resolveStream = resolve;
      });
    });

    render(<ChatInterface user={null} />);

    await new Promise(resolve => setTimeout(resolve, 1200));
    await waitFor(() => expect(sendMessageHandler).toBeDefined());

    act(() => {
      sendMessageHandler?.('Please cancel this');
    });

    await waitFor(() => expect(stopHandler).toBeDefined());
    act(() => {
      stopHandler?.();
    });

    resolveStream?.('');

    await waitFor(() => {
      expect(screen.getByTestId('chat-input').dataset.run).toBe('stoppedBeforeTokens');
    });
    expect(lastMessages.find(msg => msg.id.startsWith('temp_'))).toBeUndefined();
    expect(processingMocks.reset).toHaveBeenCalled();
  });

  it('surfaces initialization errors and reopens download dialog', async () => {
    llmMocks.streamMessageMock.mockRejectedValue(new Error('LLM not initialized'));

    render(<ChatInterface user={null} />);

    await new Promise(resolve => setTimeout(resolve, 1200));

    await act(async () => {
      sendMessageHandler?.('Trigger error');
    });

    await waitFor(() => {
      expect(lastDialogOpen).toBe(true);
    }, { timeout: 8000 });

    await waitFor(() => {
      expect(processingMocks.fail).toHaveBeenCalled();
    }, { timeout: 8000 });

    await waitFor(() => {
      const errorMessage = lastMessages[lastMessages.length - 1]?.content ?? '';
      expect(errorMessage).toContain('not initialized');
    });
  });

  it('executes rag prompt debugging helpers for video runs', async () => {
    localStorage.setItem('videoRagEnabled', 'true');
    samplerMocks.sampleUniformFramesAsBase64.mockResolvedValue([
      { time: 0, base64: 'frame-a' },
      { time: 1, base64: 'frame-b' },
    ]);
    frameExtractorMocks.extractFramesFromVideoBlob.mockResolvedValue([
      { time: 0, url: 'frame1' },
      { time: 1, url: 'frame2' },
    ]);

    const videoBlob = new Blob(['video'], { type: 'video/webm' });
    collectionMocks.searchAndQuery.mockResolvedValue([
      {
        id: 'video-set',
        content: 'Screen recording',
        source_type: 'screen',
        video_blob: videoBlob,
        video_set_videos: [
          { id: 'v1', video_blob: videoBlob, duration: 1000, timestamp: 1 },
        ],
        metadata: { duration: 1000, width: 640, height: 480 },
      },
    ]);

    render(<ChatInterface user={null} />);

    await new Promise(resolve => setTimeout(resolve, 1200));
    await waitFor(() => expect(sendMessageHandler).toBeDefined());

    await act(async () => {
      sendMessageHandler?.('Debug my screen');
    });

    await waitFor(() => {
      expect((window as any).__ragPrompt?.userQuery).toBe('Debug my screen');
    }, { timeout: 8000 });

    const ragPrompt = (window as any).__ragPrompt;
    ragPrompt.view();
    await ragPrompt.copy();
    await ragPrompt.frames(2, 2);
    await ragPrompt.viewFrames(1, 2);
    await ragPrompt.debugVLMFrames();

    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('<memory>'));
    expect(frameExtractorMocks.displayFramesInConsole).toHaveBeenCalled();
    expect(frameExtractorMocks.openFramesInWindow).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalled();
  }, 25000);
});
