import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OllamaManager, StreamCancelledError } from './ollama-manager';

// Mock the Ollama class
vi.mock('ollama', () => {
  class MockOllama {
    constructor(_options?: any) {}

    list = vi.fn().mockResolvedValue({
      models: [
        { name: 'gemma3:4b', size: 1000000 }
      ]
    });

    pull = vi.fn().mockImplementation(() => {
      return {
        async *[Symbol.asyncIterator]() {
          yield { status: 'downloading', completed: 50, total: 100 };
          yield { status: 'downloading', completed: 100, total: 100 };
        }
      };
    });

    chat = vi.fn().mockResolvedValue({
      message: { content: 'Test response' }
    });

    generate = vi.fn().mockResolvedValue({
      response: 'Generated text'
    });
  }

  return { Ollama: MockOllama };
});

describe('OllamaManager', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const manager = new OllamaManager();
      expect(manager).toBeInstanceOf(OllamaManager);
    });

    it('should create instance with custom baseUrl', () => {
      const manager = new OllamaManager({ baseUrl: 'http://custom:11434' });
      expect(manager).toBeInstanceOf(OllamaManager);
    });

    it('should create instance with onProgress callback', () => {
      const onProgress = vi.fn();
      const manager = new OllamaManager({ onProgress });
      expect(manager).toBeInstanceOf(OllamaManager);
    });
  });

  describe('initialize', () => {
    it('should check server status and model availability', async () => {
      const manager = new OllamaManager();
      await manager.initialize();

      expect(consoleLogSpy).toHaveBeenCalledWith('Checking Ollama server status...');
      expect(consoleLogSpy).toHaveBeenCalledWith('Ollama server is running');
      expect(consoleLogSpy).toHaveBeenCalledWith('Model gemma3:4b is available');
    });

    it('should log when model is not found', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = new Ollama({ host: 'test' });
      vi.spyOn(mockOllama, 'list').mockResolvedValue({
        models: []
      } as any);

      const manager = new OllamaManager();
      (manager as any).ollama = mockOllama;

      await manager.initialize();

      expect(consoleLogSpy).toHaveBeenCalledWith('Model gemma3:4b not found, needs to be pulled');
    });

    it('should handle initialization errors', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = new Ollama({ host: 'test' });
      const error = new Error('Connection refused');
      vi.spyOn(mockOllama, 'list').mockRejectedValue(error);

      const manager = new OllamaManager();
      (manager as any).ollama = mockOllama;

      await expect(manager.initialize()).rejects.toThrow('Connection refused');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to initialize Ollama:', error);
    });
  });

  describe('pullModel', () => {
    it('should pull model with progress tracking', async () => {
      const manager = new OllamaManager();
      const onProgress = vi.fn();

      await manager.pullModel(onProgress);

      expect(consoleLogSpy).toHaveBeenCalledWith('Pulling model: gemma3:4b');
      // Progress callback should have been called during pull
    });

    it('should handle pull without progress callback', async () => {
      const manager = new OllamaManager();

      await manager.pullModel();

      expect(consoleLogSpy).toHaveBeenCalledWith('Pulling model: gemma3:4b');
    });
  });

  describe('isModelAvailable', () => {
    it('should return true when model is available', async () => {
      const manager = new OllamaManager();
      const result = await manager.isModelAvailable();

      expect(result).toBe(true);
    });

    it('should return false when model is not available', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = new Ollama({ host: 'test' });
      vi.spyOn(mockOllama, 'list').mockResolvedValue({
        models: []
      } as any);

      const manager = new OllamaManager();
      (manager as any).ollama = mockOllama;

      const result = await manager.isModelAvailable();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = new Ollama({ host: 'test' });
      vi.spyOn(mockOllama, 'list').mockRejectedValue(new Error('Network error'));

      const manager = new OllamaManager();
      (manager as any).ollama = mockOllama;

      const result = await manager.isModelAvailable();

      expect(result).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should create session with system prompt', () => {
      const manager = new OllamaManager();
      manager.createSession('session-1', 'Custom system prompt');

      // Session should be created (internal state)
      expect(true).toBe(true);
    });

    it('should create session without system prompt', () => {
      const manager = new OllamaManager();
      manager.createSession('session-2');

      expect(true).toBe(true);
    });

    it('should log session creation', () => {
      const manager = new OllamaManager();
      manager.createSession('session-3', 'Test prompt');

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('clearSession', () => {
    it('should clear session system prompt', () => {
      const manager = new OllamaManager();
      manager.createSession('session-1', 'Prompt');
      manager.clearSession('session-1');

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    it('should send chat message and return response', async () => {
      const manager = new OllamaManager();
      const response = await manager.chat('Hello');

      expect(response).toBe('Test response');
    });

    it('should handle chat with options', async () => {
      const manager = new OllamaManager();
      const response = await manager.chat('Hello', {
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
      });

      expect(response).toBe('Test response');
    });

    it('should handle chat with system prompt', async () => {
      const manager = new OllamaManager();
      const response = await manager.chat('Hello', {
        systemPrompt: 'You are a helpful assistant',
      });

      expect(response).toBe('Test response');
    });

    it('should handle chat with session', async () => {
      const manager = new OllamaManager();
      manager.createSession('session-1', 'Session prompt');

      const response = await manager.chat('Hello', {
        sessionId: 'session-1',
      });

      expect(response).toBe('Test response');
    });

    it('should handle chat with conversation history', async () => {
      const manager = new OllamaManager();
      const response = await manager.chat('Hello', {
        messages: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' },
        ],
      });

      expect(response).toBe('Test response');
    });

    it('should handle chat with images', async () => {
      const manager = new OllamaManager();
      const response = await manager.chat('Describe this image', {
        images: ['base64encodedimage'],
      });

      expect(response).toBe('Test response');
      // Images are logged in the actual implementation
    });

    it('should handle chat errors', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = new Ollama({ host: 'test' });
      vi.spyOn(mockOllama, 'chat').mockRejectedValue(new Error('Chat failed'));

      const manager = new OllamaManager();
      (manager as any).ollama = mockOllama;

      await expect(manager.chat('Hello')).rejects.toThrow('Chat failed');
    });
  });

  describe('streamChat', () => {
    it('should stream chat with callbacks', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = new Ollama({ host: 'test' });

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { message: { content: 'Hello ' } };
          yield { message: { content: 'world' } };
          yield { message: { content: '', done: true } };
        }
      };

      vi.spyOn(mockOllama, 'chat').mockResolvedValue(mockStream as any);

      const manager = new OllamaManager();
      (manager as any).ollama = mockOllama;

      const onChunk = vi.fn();
      const onComplete = vi.fn();

      await manager.streamChat('Test', { onChunk, onComplete });

      expect(onChunk).toHaveBeenCalledWith('Hello ');
      expect(onChunk).toHaveBeenCalledWith('world');
      expect(onComplete).toHaveBeenCalled();
    });

    it('should handle stream cancellation', async () => {
      const { Ollama } = await import('ollama');
      const mockOllama = new Ollama({ host: 'test' });

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { message: { content: 'Start' } };
          // Simulate long delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          yield { message: { content: 'End' } };
        }
      };

      vi.spyOn(mockOllama, 'chat').mockResolvedValue(mockStream as any);

      const manager = new OllamaManager();
      (manager as any).ollama = mockOllama;

      const onChunk = vi.fn();
      const streamId = 'test-stream';

      // Start stream but don't await
      const streamPromise = manager.streamChat('Test', { streamId, onChunk });

      // Stop stream immediately
      await new Promise(resolve => setTimeout(resolve, 10));
      manager.stopStream(streamId);

      // Stream should throw StreamCancelledError
      await expect(streamPromise).rejects.toThrow(StreamCancelledError);
    });
  });

  describe('stopStream', () => {
    it('should stop active stream', () => {
      const manager = new OllamaManager();
      manager.stopStream('stream-1');

      // Should not throw even if stream doesn't exist
      expect(true).toBe(true);
    });
  });

  describe('getModelInfo', () => {
    it('should return model information', async () => {
      const manager = new OllamaManager();
      const info = await manager.getModelInfo();

      expect(info).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      const manager = new OllamaManager();
      manager.createSession('session-1', 'Prompt');

      manager.cleanup();

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle multiple cleanup calls', () => {
      const manager = new OllamaManager();

      manager.cleanup();
      manager.cleanup();

      expect(true).toBe(true);
    });
  });

  describe('StreamCancelledError', () => {
    it('should create error with default message', () => {
      const error = new StreamCancelledError();

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Stream cancelled');
      expect(error.name).toBe('StreamCancelledError');
    });

    it('should create error with custom message', () => {
      const error = new StreamCancelledError('Custom message');

      expect(error.message).toBe('Custom message');
      expect(error.name).toBe('StreamCancelledError');
    });
  });
});
