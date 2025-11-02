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
});
