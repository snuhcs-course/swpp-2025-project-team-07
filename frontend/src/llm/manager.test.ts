import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => {
  const contexts: Array<{ dispose: ReturnType<typeof vi.fn>; getSequence: () => unknown }> = [];

  const promptMock = vi.fn(async (_message?: string, _options?: any) => 'mock-response');

  const createContextMock = vi.fn(async () => {
    const context = {
      dispose: vi.fn(),
      getSequence: () => ({ token: 'sequence' }),
    };
    contexts.push(context);
    return context;
  });

  const model = {
    createContext: createContextMock,
    dispose: vi.fn(),
  };

  const loadModelMock = vi.fn(async (_options: any) => model);

  const getLlamaMock = vi.fn(async () => ({
    loadModel: loadModelMock,
  }));

  class FakeChatSession {
    static instances: Array<{ config: any; prompt: typeof promptMock }> = [];

    config: any;
    prompt: typeof promptMock;

    constructor(config: any) {
      this.config = config;
      this.prompt = promptMock;
      FakeChatSession.instances.push({ config, prompt: promptMock });
    }
  }

  return {
    contexts,
    promptMock,
    createContextMock,
    model,
    loadModelMock,
    getLlamaMock,
    FakeChatSession,
    uuidCounter: 0,
  };
});

vi.mock('uuid', () => ({
  v4: () => `session-${++state.uuidCounter}`,
}));

vi.mock('node-llama-cpp', () => ({
  getLlama: state.getLlamaMock,
  LlamaChatSession: state.FakeChatSession,
}));

import { LLMManager } from './manager';

describe('LLMManager', () => {
  beforeEach(() => {
    state.contexts.length = 0;
    state.promptMock.mockReset().mockResolvedValue('mock-response');
    state.createContextMock.mockClear();
    state.loadModelMock.mockClear();
    state.getLlamaMock.mockClear();
    state.model.dispose.mockClear();
    state.FakeChatSession.instances.length = 0;
    state.uuidCounter = 0;
  });

  it('initializes llama runtime, loads model, and creates a default session', async () => {
    const onProgress = vi.fn();
    const manager = new LLMManager({ modelPath: '/models/llama.gguf', onProgress });

    await manager.initialize();

    expect(state.getLlamaMock).toHaveBeenCalledTimes(1);
    expect(state.loadModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: '/models/llama.gguf',
        onLoadProgress: expect.any(Function),
      }),
    );

    // invoke onLoadProgress to ensure it proxies to callback
    const loadArgs = state.loadModelMock.mock.calls[0][0];
    loadArgs.onLoadProgress(0.42);
    expect(onProgress).toHaveBeenCalledWith(0.42);

    expect(state.createContextMock).toHaveBeenCalledWith({ contextSize: 32768 });
    expect(state.FakeChatSession.instances).toHaveLength(1);
    expect(state.FakeChatSession.instances[0].config.systemPrompt).toContain('You are a helpful AI assistant');

    expect(manager.getSessionCount()).toBe(1);
    expect(manager.getSessionIds()).toEqual(['session-1']);

    const info = manager.getModelInfo();
    expect(info.loaded).toBe(true);
    expect(info.contextSize).toBe(32768);
  });

  it('supports creating additional sessions with custom prompts', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    const sessionId = await manager.createSession('system override');
    expect(sessionId).toBe('session-2');
    expect(manager.getSessionCount()).toBe(2);
    expect(state.FakeChatSession.instances[1].config.systemPrompt).toBe('system override');
  });

  it('performs non-streaming chat using default parameters', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    state.promptMock.mockResolvedValueOnce('hello there');

    const reply = await manager.chat('hi');
    expect(reply).toBe('hello there');
    expect(state.promptMock).toHaveBeenCalledWith(
      'hi',
      expect.objectContaining({
        temperature: 0.7,
        maxTokens: 2048,
        topP: 0.9,
      }),
    );
  });

  it('passes custom chat options and increments message count', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();
    const sessionId = await manager.createSession();

    await manager.chat('hello', {
      sessionId,
      temperature: 0.2,
      maxTokens: 512,
      topP: 0.8,
    });

    expect(state.promptMock).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ temperature: 0.2, maxTokens: 512, topP: 0.8 }),
    );

    const sessions = (manager as any).sessions as Map<string, any>;
    expect(sessions.get(sessionId)?.messageCount).toBe(1);
  });

  it('streams chat chunks and calls completion handlers', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    const onChunk = vi.fn();
    const onComplete = vi.fn();

    state.promptMock.mockImplementationOnce(async (_message: string | undefined, options: any) => {
      options.onTextChunk?.('chunk A');
      options.onTextChunk?.('chunk B');
      return 'ignored';
    });

    await manager.streamChat('stream please', { onChunk, onComplete });

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk.mock.calls.map((args) => args[0])).toEqual(['chunk A', 'chunk B']);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const defaultSession = (manager as any).sessions.get('session-1');
    expect(defaultSession.messageCount).toBe(1);
  });

  it('cleans up resources by disposing contexts and model', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();
    await manager.createSession();

    await manager.cleanup();

    for (const ctx of state.contexts) {
      expect(ctx.dispose).toHaveBeenCalled();
    }
    expect(state.model.dispose).toHaveBeenCalledTimes(1);
    expect(manager.getSessionCount()).toBe(0);
  });

  it('removes stale sessions but keeps the default one', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();
    const sessionId = await manager.createSession();

    const sessions = (manager as any).sessions as Map<string, any>;
    sessions.get(sessionId)!.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

    await manager.cleanupOldSessions(1000);

    expect(manager.getSessionIds()).toEqual(['session-1']);
  });

  it('returns unloaded info when model not yet initialized', () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    expect(manager.getModelInfo()).toEqual({
      name: 'Unknown',
      size: 0,
      quantization: 'Unknown',
      contextSize: 0,
      loaded: false,
    });
  });

  it('throws descriptive error when chatting with missing session', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await expect(manager.chat('hi', { sessionId: 'missing' })).rejects.toThrow('Session missing not found');
  });

  it('handles errors during chat and propagates them', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.promptMock.mockRejectedValueOnce(new Error('Prompt processing failed'));

    await expect(manager.chat('test message')).rejects.toThrow('Prompt processing failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Chat error:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('throws descriptive error when streaming with missing session', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    await expect(manager.streamChat('hi', { sessionId: 'missing' })).rejects.toThrow('Session missing not found');
  });

  it('handles errors during stream chat', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.promptMock.mockRejectedValueOnce(new Error('Stream failed'));

    await expect(manager.streamChat('test')).rejects.toThrow('Stream failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Stream chat error:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('can stop an active stream', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    let chunkCount = 0;
    const onChunk = vi.fn(() => {
      chunkCount++;
      if (chunkCount === 2) {
        manager.stopStream('stream-1');
      }
    });

    state.promptMock.mockImplementationOnce(async (_message: string | undefined, options: any) => {
      options.onTextChunk?.('chunk 1');
      options.onTextChunk?.('chunk 2');
      options.onTextChunk?.('chunk 3');
      options.onTextChunk?.('chunk 4');
      return 'done';
    });

    await expect(
      manager.streamChat('test', { streamId: 'stream-1', onChunk })
    ).rejects.toThrow();

    // Should have stopped after 2 chunks
    expect(onChunk).toHaveBeenCalledTimes(2);
  });

  it('stopStream does nothing if stream is not active', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    await expect(manager.stopStream('nonexistent')).resolves.not.toThrow();
  });

  it('calls session abort method when stopping stream if available', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    const abortMock = vi.fn().mockResolvedValue(undefined);
    const sessions = (manager as any).sessions as Map<string, any>;
    const sessionData = sessions.get('session-1');
    sessionData.session.abort = abortMock;

    state.promptMock.mockImplementationOnce(async (_message: string | undefined, options: any) => {
      await manager.stopStream('test-stream');
      options.onTextChunk?.('chunk');
      return 'done';
    });

    await expect(
      manager.streamChat('test', { streamId: 'test-stream' })
    ).rejects.toThrow();

    expect(abortMock).toHaveBeenCalled();
  });

  it('handles abort errors gracefully', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const abortMock = vi.fn().mockRejectedValue(new Error('Abort failed'));
    const sessions = (manager as any).sessions as Map<string, any>;
    const sessionData = sessions.get('session-1');
    sessionData.session.abort = abortMock;

    state.promptMock.mockImplementationOnce(async (_message: string | undefined, options: any) => {
      await manager.stopStream('test-stream');
      options.onTextChunk?.('chunk');
      return 'done';
    });

    await expect(
      manager.streamChat('test', { streamId: 'test-stream' })
    ).rejects.toThrow();

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[LLMManager] Failed to abort session stream:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  it('passes videos to prompt options when provided', async () => {
    const manager = new LLMManager({ modelPath: '/models/llama.gguf' });
    await manager.initialize();

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const videos = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

    await manager.streamChat('test with videos', { videos });

    expect(state.promptMock).toHaveBeenCalledWith(
      'test with videos',
      expect.objectContaining({
        images: videos,
      })
    );

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[LLM] Prepared 2 image(s)')
    );

    consoleLogSpy.mockRestore();
  });
});
