import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock onnxruntime-web
const mockEnv = {
  wasm: {
    numThreads: 0,
    proxy: true,
  },
  logLevel: 'warning' as const,
};

vi.mock('onnxruntime-web', () => {
  return {
    default: {
      env: mockEnv,
    },
    env: mockEnv,
  };
});

describe('ORT Module', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should export the ort object', async () => {
    const ort = await import('@/embedding/ort');
    expect(ort.default).toBeDefined();
    expect(typeof ort.default).toBe('object');
  });

  it('should set ort.env.wasm.numThreads to 1', async () => {
    const ort = await import('@/embedding/ort');
    expect(ort.default.env.wasm.numThreads).toBe(1);
  });

  it('should set ort.env.wasm.proxy to false', async () => {
    const ort = await import('@/embedding/ort');
    expect(ort.default.env.wasm.proxy).toBe(false);
  });

  it('should set ort.env.logLevel to error', async () => {
    const ort = await import('@/embedding/ort');
    expect(ort.default.env.logLevel).toBe('error');
  });

  it('should log the expected message when module is loaded', async () => {
    await import('@/embedding/ort');
    expect(consoleSpy).toHaveBeenCalledWith('[ort] ONNX Runtime loaded from node_modules');
  });

  it('should have all required ort configuration in place', async () => {
    const ort = await import('@/embedding/ort');
    expect(ort.default.env.wasm.numThreads).toBe(1);
    expect(ort.default.env.wasm.proxy).toBe(false);
    expect(ort.default.env.logLevel).toBe('error');
  });
});
