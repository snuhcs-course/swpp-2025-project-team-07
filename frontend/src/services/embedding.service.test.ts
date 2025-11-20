import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbeddingService, embeddingService } from './embedding';

const originalEmbeddingAPI = window.embeddingAPI;

describe('EmbeddingService', () => {
  beforeEach(() => {
    window.embeddingAPI = {
      embedQuery: vi.fn().mockResolvedValue([0.1, 0.2]),
      embedContext: vi.fn().mockResolvedValue([0.3, 0.4]),
      isReady: vi.fn().mockResolvedValue(true),
    } as any;
  });

  afterEach(() => {
    window.embeddingAPI = originalEmbeddingAPI;
    vi.restoreAllMocks();
  });

  it('returns the singleton instance for every call', () => {
    const first = EmbeddingService.getInstance();
    const second = EmbeddingService.getInstance();

    expect(first).toBe(second);
    expect(first).toBe(embeddingService);
  });

  it('delegates embedQuery to window.embeddingAPI', async () => {
    const instance = EmbeddingService.getInstance();
    const result = await instance.embedQuery('hello world');

    expect(window.embeddingAPI.embedQuery).toHaveBeenCalledWith('hello world');
    expect(result).toEqual([0.1, 0.2]);
  });

  it('throws a descriptive error when embedding API is unavailable', async () => {
    window.embeddingAPI = undefined as any;
    const instance = EmbeddingService.getInstance();

    await expect(instance.embedQuery('hello')).rejects.toThrow('Embedding API not available');
  });

  it('wraps embedQuery errors with a user-friendly message', async () => {
    const error = new Error('network down');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window.embeddingAPI.embedQuery as any).mockRejectedValue(error);
    const instance = EmbeddingService.getInstance();

    await expect(instance.embedQuery('hi')).rejects.toThrow('Failed to generate query embedding');
    expect(consoleSpy).toHaveBeenCalledWith('Failed to embed query:', error);
    consoleSpy.mockRestore();
  });

  it('delegates embedContext to window.embeddingAPI', async () => {
    const instance = EmbeddingService.getInstance();
    const result = await instance.embedContext('context');

    expect(window.embeddingAPI.embedContext).toHaveBeenCalledWith('context');
    expect(result).toEqual([0.3, 0.4]);
  });

  it('returns false from isReady when API errors', async () => {
    (window.embeddingAPI.isReady as any).mockRejectedValue(new Error('boom'));
    const instance = EmbeddingService.getInstance();

    await expect(instance.isReady()).resolves.toBe(false);
  });

  it('detects availability based on window.embeddingAPI presence', () => {
    const instance = EmbeddingService.getInstance();
    expect(instance.isAvailable()).toBe(true);

    window.embeddingAPI = undefined as any;
    expect(instance.isAvailable()).toBe(false);
  });

  it('throws error when embedContext called with unavailable API', async () => {
    window.embeddingAPI = undefined as any;
    const instance = EmbeddingService.getInstance();

    await expect(instance.embedContext('test')).rejects.toThrow('Embedding API not available');
  });

  it('wraps embedContext errors with a user-friendly message', async () => {
    const error = new Error('network timeout');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window.embeddingAPI.embedContext as any).mockRejectedValue(error);
    const instance = EmbeddingService.getInstance();

    await expect(instance.embedContext('some context')).rejects.toThrow('Failed to generate context embedding');
    expect(consoleSpy).toHaveBeenCalledWith('Failed to embed context:', error);
    consoleSpy.mockRestore();
  });

  it('returns false from isReady when API is unavailable', async () => {
    window.embeddingAPI = undefined as any;
    const instance = EmbeddingService.getInstance();

    await expect(instance.isReady()).resolves.toBe(false);
  });

  it('returns true from isReady when API is ready', async () => {
    const instance = EmbeddingService.getInstance();
    await expect(instance.isReady()).resolves.toBe(true);
    expect(window.embeddingAPI.isReady).toHaveBeenCalled();
  });

  describe('embedVideoQuery', () => {
    it('returns CLIP text embedding as array', async () => {
      const mockEmbedding = new Float32Array([0.5, 0.6, 0.7]);

      vi.doMock('@/embedding/ClipVideoEmbedder', () => ({
        ClipVideoEmbedder: {
          get: vi.fn().mockResolvedValue({
            embedText: vi.fn().mockResolvedValue(mockEmbedding),
          }),
        },
      }));

      const instance = EmbeddingService.getInstance();
      const result = await instance.embedVideoQuery('video query');

      expect(result).toHaveLength(3);
      expect(result![0]).toBeCloseTo(0.5);
      expect(result![1]).toBeCloseTo(0.6);
      expect(result![2]).toBeCloseTo(0.7);
    });

    it('returns null when CLIP text embedding fails', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.doMock('@/embedding/ClipVideoEmbedder', () => ({
        ClipVideoEmbedder: {
          get: vi.fn().mockRejectedValue(new Error('CLIP not available')),
        },
      }));

      const instance = EmbeddingService.getInstance();
      const result = await instance.embedVideoQuery('video query');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[embedding] CLIP text embedding not available (vision-only model):',
        expect.any(Error)
      );
      consoleWarnSpy.mockRestore();
    });

    it('returns null when embedText throws error', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.doMock('@/embedding/ClipVideoEmbedder', () => ({
        ClipVideoEmbedder: {
          get: vi.fn().mockResolvedValue({
            embedText: vi.fn().mockRejectedValue(new Error('Text encoder not loaded')),
          }),
        },
      }));

      const instance = EmbeddingService.getInstance();
      const result = await instance.embedVideoQuery('video query');

      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });
});
