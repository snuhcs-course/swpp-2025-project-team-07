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
    });

    await instance.streamMessage('hello stream', onChunk, { temperature: 0.9 });

    expect(window.llmAPI.onStreamChunk).toHaveBeenCalledTimes(1);
    expect(window.llmAPI.offStreamChunk).toHaveBeenCalledWith(capturedHandler);
    expect(window.llmAPI.streamChat).toHaveBeenCalledWith('hello stream', {
      temperature: 0.9,
      sessionId: undefined,
      streamId: 'stream-123',
    });

    capturedHandler?.({ streamId: 'stream-123', chunk: 'hi', done: false });
    capturedHandler?.({ streamId: 'other', chunk: 'nope', done: false });
    capturedHandler?.({ streamId: 'stream-123', chunk: 'final', done: true });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('hi');
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
});
