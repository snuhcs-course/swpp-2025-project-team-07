import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClipVideoEmbedder } from './ClipVideoEmbedder';
import ort from './ort';

// Mock ort module
vi.mock('./ort', () => ({
  default: {
    InferenceSession: {
      create: vi.fn(),
    },
    Tensor: class MockTensor {
      constructor(
        public type: string,
        public data: any,
        public dims: number[],
      ) {}
    },
  },
}));

// Mock video-sampler
vi.mock('./video-sampler', () => ({
  sampleUniformFrames: vi.fn(),
}));

describe('ClipVideoEmbedder', () => {
  const originalWindow = globalThis.window;
  const originalOffscreenCanvas = (globalThis as any).OffscreenCanvas;
  let mockSession: any;

  beforeEach(() => {
    // Reset singleton instance
    (ClipVideoEmbedder as any)._inst = null;

    // Mock OffscreenCanvas
    (globalThis as any).OffscreenCanvas = class MockOffscreenCanvas {
      width: number;
      height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(type: string, options?: any) {
        return {
          drawImage: vi.fn(),
          putImageData: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(this.width * this.height * 4).fill(128),
          }),
        };
      }
    };

    // Mock window.llmAPI
    (globalThis as any).window = {
      llmAPI: {
        getVideoModelBytes: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      },
    };

    // Create mock session
    mockSession = {
      inputNames: ['pixel_values'],
      outputNames: ['image_embeds'],
      inputMetadata: {},
      run: vi.fn().mockResolvedValue({
        image_embeds: {
          dims: [1, 512],
          data: new Float32Array(512).fill(0.1),
        },
      }),
    };

    vi.mocked(ort.InferenceSession.create).mockResolvedValue(mockSession as any);
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).OffscreenCanvas = originalOffscreenCanvas;
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('returns the same instance on multiple calls', async () => {
      const first = await ClipVideoEmbedder.get();
      const second = await ClipVideoEmbedder.get();

      expect(first).toBe(second);
    });

    it('initializes the model when first accessed', async () => {
      await ClipVideoEmbedder.get();

      expect((globalThis as any).window.llmAPI.getVideoModelBytes).toHaveBeenCalled();
      expect(ort.InferenceSession.create).toHaveBeenCalled();
    });

    it('only initializes once even with concurrent calls', async () => {
      const [first, second, third] = await Promise.all([
        ClipVideoEmbedder.get(),
        ClipVideoEmbedder.get(),
        ClipVideoEmbedder.get(),
      ]);

      expect(first).toBe(second);
      expect(second).toBe(third);
      expect((globalThis as any).window.llmAPI.getVideoModelBytes).toHaveBeenCalledTimes(1);
    });
  });

  describe('init', () => {
    it('detects vision-only model correctly', async () => {
      mockSession.inputNames = ['pixel_values'];
      mockSession.outputNames = ['image_embeds'];

      const embedder = await ClipVideoEmbedder.get();

      expect((embedder as any).needTextFeeds).toBe(false);
      expect((embedder as any).inputName).toBe('pixel_values');
      expect((embedder as any).imageOutputName).toBe('image_embeds');
    });

    it('detects unified CLIP model with text support', async () => {
      mockSession.inputNames = ['pixel_values', 'input_ids', 'attention_mask'];
      mockSession.outputNames = ['image_embeds'];
      mockSession.inputMetadata = {
        input_ids: { type: 'int64', dimensions: [1, 77] },
        attention_mask: { type: 'int64', dimensions: [1, 77] },
      };

      const embedder = await ClipVideoEmbedder.get();

      expect((embedder as any).needTextFeeds).toBe(true);
      expect((embedder as any).textSeqLen).toBe(77);
      expect((embedder as any).inputDTypes['input_ids']).toBe('int64');
      expect((embedder as any).inputDTypes['attention_mask']).toBe('int64');
    });

    it('falls back to first input/output when standard names not found', async () => {
      mockSession.inputNames = ['custom_input'];
      mockSession.outputNames = ['custom_output'];

      const embedder = await ClipVideoEmbedder.get();

      expect((embedder as any).inputName).toBe('custom_input');
      expect((embedder as any).imageOutputName).toBe('custom_output');
    });

    it('prioritizes standard output names in correct order', async () => {
      mockSession.inputNames = ['pixel_values'];
      mockSession.outputNames = ['last_hidden_state', 'pooled_output', 'image_embeds'];

      const embedder = await ClipVideoEmbedder.get();

      expect((embedder as any).imageOutputName).toBe('image_embeds');
    });
  });

  describe('embedImage', () => {
    it('returns normalized embedding for valid image', async () => {
      const mockCanvas = {
        width: 224,
        height: 224,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(224 * 224 * 4).fill(128),
          }),
        }),
      } as any;

      const embedder = await ClipVideoEmbedder.get();
      const result = await embedder.embedImage(mockCanvas);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(512);

      // Check L2 normalization: sum of squares should be ~1
      let sumSq = 0;
      for (let i = 0; i < result.length; i++) {
        sumSq += result[i] * result[i];
      }
      expect(sumSq).toBeCloseTo(1, 5);
    });

    it('handles 3D output tensor correctly', async () => {
      mockSession.run.mockResolvedValue({
        image_embeds: {
          dims: [1, 10, 512],
          data: new Float32Array(10 * 512).fill(0.1),
        },
      });

      const mockCanvas = {
        width: 224,
        height: 224,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(224 * 224 * 4).fill(128),
          }),
        }),
      } as any;

      const embedder = await ClipVideoEmbedder.get();
      const result = await embedder.embedImage(mockCanvas);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(512);
    });

    it('throws error when output not found', async () => {
      mockSession.run.mockResolvedValue({});

      const mockCanvas = {
        width: 224,
        height: 224,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(224 * 224 * 4).fill(128),
          }),
        }),
      } as any;

      const embedder = await ClipVideoEmbedder.get();

      await expect(embedder.embedImage(mockCanvas)).rejects.toThrow(/output.*not found/);
    });

    it('throws error for unexpected batch size in 3D output', async () => {
      mockSession.run.mockResolvedValue({
        image_embeds: {
          dims: [2, 10, 512],
          data: new Float32Array(2 * 10 * 512).fill(0.1),
        },
      });

      const mockCanvas = {
        width: 224,
        height: 224,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(224 * 224 * 4).fill(128),
          }),
        }),
      } as any;

      const embedder = await ClipVideoEmbedder.get();

      await expect(embedder.embedImage(mockCanvas)).rejects.toThrow(/unexpected batch size/);
    });

    it('throws error for unhandled output shape', async () => {
      mockSession.run.mockResolvedValue({
        image_embeds: {
          dims: [1, 2, 3, 4],
          data: new Float32Array(24).fill(0.1),
        },
      });

      const mockCanvas = {
        width: 224,
        height: 224,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(224 * 224 * 4).fill(128),
          }),
        }),
      } as any;

      const embedder = await ClipVideoEmbedder.get();

      await expect(embedder.embedImage(mockCanvas)).rejects.toThrow(/unhandled output shape/);
    });

    it('adds text feeds for unified CLIP models when embedding images', async () => {
      mockSession.inputNames = ['pixel_values', 'input_ids', 'attention_mask'];
      mockSession.outputNames = ['image_embeds'];
      mockSession.inputMetadata = {
        input_ids: { type: 'int64', dimensions: [1, 77] },
        attention_mask: { type: 'int64', dimensions: [1, 77] },
      };

      const embedder = await ClipVideoEmbedder.get();

      const mockCanvas = {
        width: 224,
        height: 224,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn(),
          getImageData: vi.fn().mockReturnValue({
            data: new Uint8ClampedArray(224 * 224 * 4).fill(128),
          }),
        }),
      } as any;

      await embedder.embedImage(mockCanvas);

      const runCall = mockSession.run.mock.calls[0][0];
      expect(runCall).toHaveProperty('input_ids');
      expect(runCall).toHaveProperty('attention_mask');
    });
  });

  describe('embedText', () => {
    it('throws error for vision-only models', async () => {
      mockSession.inputNames = ['pixel_values'];
      mockSession.outputNames = ['image_embeds'];

      const embedder = await ClipVideoEmbedder.get();

      await expect(embedder.embedText('test query')).rejects.toThrow(/vision-only model/);
    });

    it('returns normalized embedding for unified CLIP model', async () => {
      mockSession.inputNames = ['pixel_values', 'input_ids', 'attention_mask'];
      mockSession.outputNames = ['image_embeds'];
      mockSession.inputMetadata = {
        input_ids: { type: 'int64', dimensions: [1, 77] },
        attention_mask: { type: 'int64', dimensions: [1, 77] },
      };

      const embedder = await ClipVideoEmbedder.get();
      const result = await embedder.embedText('test query');

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(512);

      // Check L2 normalization
      let sumSq = 0;
      for (let i = 0; i < result.length; i++) {
        sumSq += result[i] * result[i];
      }
      expect(sumSq).toBeCloseTo(1, 5);
    });

    it('handles 3D output tensor correctly', async () => {
      mockSession.inputNames = ['pixel_values', 'input_ids', 'attention_mask'];
      mockSession.outputNames = ['image_embeds'];
      mockSession.inputMetadata = {
        input_ids: { type: 'int64', dimensions: [1, 77] },
        attention_mask: { type: 'int64', dimensions: [1, 77] },
      };
      mockSession.run.mockResolvedValue({
        image_embeds: {
          dims: [1, 10, 512],
          data: new Float32Array(10 * 512).fill(0.1),
        },
      });

      const embedder = await ClipVideoEmbedder.get();
      const result = await embedder.embedText('test query');

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(512);
    });
  });

  describe('makeZerosTensor', () => {
    it('creates int64 tensor with zeros', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const tensor = (embedder as any).makeZerosTensor('test', 'int64', [1, 77], false);

      expect(tensor.type).toBe('int64');
      expect(tensor.dims).toEqual([1, 77]);
      expect(tensor.data.length).toBe(77);
      expect(tensor.data[0]).toBe(0n);
    });

    it('creates int64 tensor with ones', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const tensor = (embedder as any).makeZerosTensor('test', 'int64', [1, 77], true);

      expect(tensor.type).toBe('int64');
      expect(tensor.data[0]).toBe(1n);
    });

    it('creates int32 tensor', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const tensor = (embedder as any).makeZerosTensor('test', 'int32', [1, 77], false);

      expect(tensor.type).toBe('int32');
      expect(tensor.data).toBeInstanceOf(Int32Array);
    });

    it('creates float32 tensor by default', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const tensor = (embedder as any).makeZerosTensor('test', 'unknown' as any, [1, 77], false);

      expect(tensor.type).toBe('float32');
      expect(tensor.data).toBeInstanceOf(Float32Array);
    });
  });

  describe('dimFix', () => {
    it('returns the dimension when it is a positive number', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const result = (embedder as any).dimFix(77, 100);

      expect(result).toBe(77);
    });

    it('returns fallback when dimension is zero', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const result = (embedder as any).dimFix(0, 100);

      expect(result).toBe(100);
    });

    it('returns fallback when dimension is negative', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const result = (embedder as any).dimFix(-1, 100);

      expect(result).toBe(100);
    });

    it('returns fallback when dimension is a string', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const result = (embedder as any).dimFix('batch', 100);

      expect(result).toBe(100);
    });

    it('returns fallback when dimension is undefined', async () => {
      const embedder = await ClipVideoEmbedder.get();
      const result = (embedder as any).dimFix(undefined, 100);

      expect(result).toBe(100);
    });
  });
});
