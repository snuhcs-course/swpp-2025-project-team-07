import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'stream-123'),
}));

import { LLMService, llmService } from './llm';

const originalLLMAPI = window.llmAPI;

describe('LLMService', () => {
  beforeEach(() => {
    window.llmAPI = {
      chat: vi.fn().mockResolvedValue('ok'),
      streamChat: vi.fn().mockResolvedValue(undefined),
      stopStream: vi.fn().mockResolvedValue(undefined),
      onStreamChunk: vi.fn(),
      offStreamChunk: vi.fn(),
      createSession: vi.fn().mockResolvedValue('session-abc'),
      clearSession: vi.fn().mockResolvedValue(undefined),
      getModelInfo: vi.fn().mockResolvedValue({ name: 'Test', version: '1' }),
    } as any;

    LLMService.getInstance().setCurrentSessionId(null);
  });

  afterEach(() => {
    LLMService.getInstance().setCurrentSessionId(null);
    window.llmAPI = originalLLMAPI;
    vi.restoreAllMocks();
  });

  it('returns the singleton instance for every call', () => {
    const first = LLMService.getInstance();
    const second = LLMService.getInstance();

    expect(first).toBe(second);
    expect(first).toBe(llmService);
  });

  it('sendMessage forwards payload and merges session options', async () => {
    const instance = LLMService.getInstance();
    instance.setCurrentSessionId('existing-session');

    const result = await instance.sendMessage('hello', { temperature: 0.5 });

    expect(window.llmAPI.chat).toHaveBeenCalledWith('hello', {
      temperature: 0.5,
      sessionId: 'existing-session',
    });
    expect(result).toBe('ok');
  });

  it('sendMessage throws a friendly error when API call fails', async () => {
    const error = new Error('offline');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window.llmAPI.chat as any).mockRejectedValue(error);
    const instance = LLMService.getInstance();

    await expect(instance.sendMessage('hello')).rejects.toThrow(
      'Failed to communicate with AI model. Make sure the model is loaded.',
    );
    expect(consoleSpy).toHaveBeenCalledWith('Failed to send message:', error);
    consoleSpy.mockRestore();
  });

  it('streamMessage wires chunk handlers to the active stream id', async () => {
    const instance = LLMService.getInstance();
    const onChunk = vi.fn();
    let capturedHandler: ((chunk: any) => void) | undefined;

    (window.llmAPI.onStreamChunk as any).mockImplementation((handler: (chunk: any) => void) => {
      capturedHandler = handler;
    });
    (window.llmAPI.streamChat as any).mockImplementation(async (_message: string, options: any) => {
      expect(options.streamId).toBe('stream-123');
      queueMicrotask(() => {
        capturedHandler?.({ streamId: 'stream-123', chunk: 'hi', done: false });
      });
    });

    await instance.streamMessage('hello stream', onChunk, { temperature: 0.9 });

    expect(window.llmAPI.onStreamChunk).toHaveBeenCalledTimes(1);
    expect(window.llmAPI.offStreamChunk).toHaveBeenCalledWith(capturedHandler);
    expect(window.llmAPI.streamChat).toHaveBeenCalledWith('hello stream', {
      temperature: 0.9,
      sessionId: undefined,
      streamId: 'stream-123',
    });

    capturedHandler?.({ streamId: 'other', chunk: 'nope', done: false });
    capturedHandler?.({ streamId: 'stream-123', chunk: 'final', done: true });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('hi');
  });

  it('stopStreaming requests cancellation and prevents further chunk processing', async () => {
    const instance = LLMService.getInstance();
    const onChunk = vi.fn();
    let capturedHandler: ((chunk: any) => void) | undefined;

    (window.llmAPI.onStreamChunk as any).mockImplementation((handler: (chunk: any) => void) => {
      capturedHandler = handler;
    });

    let resolveStream: (() => void) | undefined;
    (window.llmAPI.streamChat as any).mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveStream = resolve;
        }),
    );

    (window.llmAPI.stopStream as any).mockImplementation(async () => {
      resolveStream?.();
    });

    const streamPromise = instance.streamMessage('stop me', onChunk);

    await instance.stopStreaming();
    await expect(streamPromise).rejects.toThrow('StreamCancelledError');

    expect(window.llmAPI.stopStream).toHaveBeenCalledWith('stream-123');
    expect(window.llmAPI.offStreamChunk).toHaveBeenCalledWith(capturedHandler);

    capturedHandler?.({ streamId: 'stream-123', chunk: 'ignored', done: false });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('waits for an active stream to finish before starting a new one', async () => {
    const instance = LLMService.getInstance();
    const firstOnChunk = vi.fn();
    const secondOnChunk = vi.fn();
    const handlers: ((chunk: any) => void)[] = [];

    (window.llmAPI.onStreamChunk as any).mockImplementation((handler: (chunk: any) => void) => {
      handlers.push(handler);
    });

    let resolveFirstStream: (() => void) | undefined;
    const firstStreamDeferred = new Promise<void>(resolve => {
      resolveFirstStream = resolve;
    });

    (window.llmAPI.streamChat as any)
      .mockImplementationOnce(() => firstStreamDeferred)
      .mockImplementationOnce(async () => undefined);

    const firstStreamPromise = instance.streamMessage('queued-1', firstOnChunk);

    await Promise.resolve();

    const secondStreamPromise = instance.streamMessage('queued-2', secondOnChunk);

    await Promise.resolve();

    expect(window.llmAPI.streamChat).toHaveBeenCalledTimes(1);

    resolveFirstStream?.();
    await expect(firstStreamPromise).resolves.toBeUndefined();

    await Promise.resolve();
    expect(window.llmAPI.streamChat).toHaveBeenCalledTimes(2);

    await expect(secondStreamPromise).resolves.toBeUndefined();
    expect(handlers).toHaveLength(2);
  });

  it('allows starting a new stream while a previous stop is still completing', async () => {
    const instance = LLMService.getInstance();
    const onChunk = vi.fn();
    const handlers: ((chunk: any) => void)[] = [];

    (window.llmAPI.onStreamChunk as any).mockImplementation((handler: (chunk: any) => void) => {
      handlers.push(handler);
    });

    let resolveFirstStream: (() => void) | undefined;
    const firstStreamDeferred = new Promise<void>(resolve => {
      resolveFirstStream = resolve;
    });

    let resolveSecondStream: (() => void) | undefined;
    const secondStreamDeferred = new Promise<void>(resolve => {
      resolveSecondStream = resolve;
    });

    (window.llmAPI.streamChat as any)
      .mockImplementationOnce(() => firstStreamDeferred)
      .mockImplementationOnce(() => secondStreamDeferred);

    let resolveStopStream: (() => void) | undefined;
    const stopStreamDeferred = new Promise<void>(resolve => {
      resolveStopStream = resolve;
    });

    (window.llmAPI.stopStream as any).mockImplementation(() => {
      resolveFirstStream?.();
      return stopStreamDeferred;
    });

    const firstStreamPromise = instance.streamMessage('first', onChunk);

    const stopPromise = instance.stopStreaming();

    expect(window.llmAPI.offStreamChunk).toHaveBeenCalledWith(handlers[0]);

    const secondStreamPromise = instance.streamMessage('second', onChunk);

    resolveSecondStream?.();
    await expect(secondStreamPromise).resolves.toBeUndefined();

    resolveStopStream?.();

    await expect(stopPromise).resolves.toBeUndefined();
    await expect(firstStreamPromise).rejects.toThrow('StreamCancelledError');
    expect(window.llmAPI.onStreamChunk).toHaveBeenCalledTimes(2);
  });

  it('creates sessions and stores the current session id', async () => {
    const instance = LLMService.getInstance();

    const sessionId = await instance.createSession('system prompt');

    expect(window.llmAPI.createSession).toHaveBeenCalledWith('system prompt');
    expect(sessionId).toBe('session-abc');
    expect(instance.getCurrentSessionId()).toBe('session-abc');
  });

  it('clears the active session and resets current session id', async () => {
    const instance = LLMService.getInstance();
    instance.setCurrentSessionId('session-xyz');

    await instance.clearSession();

    expect(window.llmAPI.clearSession).toHaveBeenCalledWith('session-xyz');
    expect(instance.getCurrentSessionId()).toBeNull();
  });

  it('can clear a specific session without touching the current one', async () => {
    const instance = LLMService.getInstance();
    instance.setCurrentSessionId('keep-me');

    await instance.clearSession('other-session');

    expect(window.llmAPI.clearSession).toHaveBeenCalledWith('other-session');
    expect(instance.getCurrentSessionId()).toBe('keep-me');
  });

  it('returns model info via the preload bridge', async () => {
    const instance = LLMService.getInstance();
    const info = await instance.getModelInfo();

    expect(window.llmAPI.getModelInfo).toHaveBeenCalledTimes(1);
    expect(info).toEqual({ name: 'Test', version: '1' });
  });

  it('detects API availability based on window.llmAPI presence', () => {
    const instance = LLMService.getInstance();
    expect(instance.isAvailable()).toBe(true);

    window.llmAPI = undefined as any;
    expect(instance.isAvailable()).toBe(false);
  });

  it('generates a concise title from conversation', async () => {
    const instance = LLMService.getInstance();
    (window.llmAPI.chat as any).mockResolvedValue('"AI Model Discussion"');

    const title = await instance.generateTitle('What is an AI model?', 'An AI model is a system...');

    expect(window.llmAPI.chat).toHaveBeenCalledWith(
      expect.stringContaining('generate a very short and concise title'),
      { temperature: 0.3, maxTokens: 20 }
    );
    expect(title).toBe('AI Model Discussion');
  });

  it('cleans generated title by removing quotes and punctuation', async () => {
    const instance = LLMService.getInstance();
    (window.llmAPI.chat as any).mockResolvedValue("'Machine Learning Basics!!!'");

    const title = await instance.generateTitle('How does ML work?', 'Machine learning works by...');

    expect(title).toBe('Machine Learning Basics');
  });

  it('truncates long titles to 50 characters', async () => {
    const instance = LLMService.getInstance();
    const longTitle = 'A Very Long Title That Exceeds The Maximum Character Limit For Conversation Titles';
    (window.llmAPI.chat as any).mockResolvedValue(longTitle);

    const title = await instance.generateTitle('Long question', 'Long answer');

    expect(title).toBe(longTitle.substring(0, 50));
  });

  it('falls back to user message when title generation fails', async () => {
    const instance = LLMService.getInstance();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window.llmAPI.chat as any).mockRejectedValue(new Error('API error'));

    const title = await instance.generateTitle('Short message', 'Response');

    expect(title).toBe('Short message');
    expect(consoleSpy).toHaveBeenCalledWith('Failed to generate title:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('truncates fallback title and adds ellipsis for long user messages', async () => {
    const instance = LLMService.getInstance();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window.llmAPI.chat as any).mockRejectedValue(new Error('API error'));
    const longMessage = 'This is a very long user message that exceeds thirty characters';

    const title = await instance.generateTitle(longMessage, 'Response');

    expect(title).toBe('This is a very long user messa...');
    expect(title.length).toBe(33); // 30 chars + "..."
    consoleSpy.mockRestore();
  });
});
