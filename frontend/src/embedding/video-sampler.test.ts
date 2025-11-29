import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as sampler from './video-sampler';
import {
  DEFAULT_VIDEO_SAMPLE_FRAMES,
  VideoFrameSampler,
  sampleUniformFrames,
  sampleUniformFramesAsBase64,
} from './video-sampler';

const originalCreateElement = document.createElement.bind(document);
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const ImageDataPolyfill = class {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
};

describe('video-sampler', () => {
  const privates = (sampler as any).__private__;
  beforeEach(() => {
    (global as any).ImageData = (global as any).ImageData ?? (ImageDataPolyfill as any);
    URL.createObjectURL = vi.fn(() => 'blob:url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('delegates sampling to VideoFrameSampler with sane defaults', async () => {
    const frames = [{ time: 0.5, image: new ImageData(1, 1) }];
    const samplerSpy = vi
      .spyOn(VideoFrameSampler, 'uniformSample')
      .mockResolvedValue({ frames, duration: 1, width: 1, height: 1 });

    const result = await sampleUniformFrames(new Blob(['data']), 0, { size: 128 });

    expect(result).toEqual(frames);
    expect(samplerSpy).toHaveBeenCalledWith(expect.any(Blob), 1, { size: 128 });
  });

  it('converts sampled frames to base64 strings using a canvas', async () => {
    const imgData = new ImageData(new Uint8ClampedArray(4), 1, 1);
    document.createElement = ((tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 1,
          height: 1,
          getContext: () => ({
            putImageData: vi.fn(),
            clearRect: vi.fn(),
            drawImage: vi.fn(),
          }),
          toDataURL: vi.fn(() => 'data:image/jpeg;base64,abc123'),
        } as any;
      }
      return originalCreateElement(tag);
    }) as any;

    vi.spyOn(VideoFrameSampler, 'uniformSample').mockResolvedValue({
      frames: [
        { time: 0, image: imgData, imageData: imgData },
        { time: 1, image: imgData },
      ],
      duration: 1,
      width: 1,
      height: 1,
    });

    const result = await sampler.sampleUniformFramesAsBase64(new Blob(['video']), DEFAULT_VIDEO_SAMPLE_FRAMES, {
      format: 'image/jpeg',
      quality: 0.8,
    });

    expect(result).toEqual([
      { time: 0, base64: 'abc123' },
      { time: 1, base64: 'abc123' },
    ]);
  });

  it('samples frames uniformly and cleans up URLs', async () => {
    const listeners: Record<string, Array<() => void>> = {};

    const videoStub: any = {
      readyState: 0,
      videoWidth: 8,
      videoHeight: 8,
      duration: 1,
      muted: false,
      playsInline: false,
      _onloadedmetadata: null as any,
      onloadedmetadata: null as any,
      onerror: null as any,
      addEventListener: (type: string, handler: () => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      removeEventListener: vi.fn(),
      set src(_url: string) {
        setTimeout(() => {
          this.readyState = 1;
          this.onloadedmetadata?.();
          listeners['loadedmetadata']?.forEach(fn => fn());
        }, 0);
      },
      set currentTime(_t: number) {
        setTimeout(() => {
          listeners['seeked']?.forEach(fn => fn());
          listeners['timeupdate']?.forEach(fn => fn());
        }, 0);
      },
    };

    const canvasStub = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getImageData: vi.fn(() => new ImageData(8, 8)),
      }),
    };

    document.createElement = ((tag: string) => {
      if (tag === 'video') return videoStub;
      if (tag === 'canvas') return canvasStub as any;
      return originalCreateElement(tag);
    }) as any;

    const result = await VideoFrameSampler.uniformSample(new Blob(['clip']), 2, { size: 4 });

    expect(result.frames).toHaveLength(2);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
  });

  it('throws when no canvas context is available', async () => {
    document.createElement = ((tag: string) => {
      if (tag === 'canvas') {
        return { getContext: () => null } as any;
      }
      return originalCreateElement(tag);
    }) as any;

    vi.spyOn(VideoFrameSampler, 'uniformSample').mockResolvedValue({
      frames: [{ time: 0, image: new ImageData(1, 1), imageData: new ImageData(1, 1) }],
      duration: 1,
      width: 1,
      height: 1,
    });

    await expect(sampleUniformFramesAsBase64(new Blob(['clip']), 1)).rejects.toThrow('Canvas 2D context not available');
  });

  it('waits for metadata and finite duration when duration is not ready', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const video: any = {
      readyState: 0,
      duration: Infinity,
      addEventListener: (type: string, handler: () => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      removeEventListener: vi.fn((type: string, handler: () => void) => {
        listeners[type] = (listeners[type] || []).filter(fn => fn !== handler);
      }),
      set currentTime(_t: number) {
        (listeners['timeupdate'] || []).forEach(fn => fn());
      },
    };

    const promise = privates.ensureFiniteDuration(video);
    (listeners['loadedmetadata'] || []).forEach(fn => fn());
    video.duration = 2;
    (listeners['timeupdate'] || []).forEach(fn => fn());
    const duration = await promise;

    expect(duration).toBe(2);
    expect(video.removeEventListener).toHaveBeenCalled();
  });

  it('rejects when metadata fails to load', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const video: any = {
      readyState: 0,
      addEventListener: (type: string, handler: () => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      removeEventListener: vi.fn(),
    };

    const promise = privates.waitForMetadata(video);
    (listeners['error'] || []).forEach(fn => fn());

    await expect(promise).rejects.toThrow('metadata error');
  });
});
