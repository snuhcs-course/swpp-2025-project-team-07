import path from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @xenova/transformers as a virtual module per TESTING.md guidance
vi.mock('@xenova/transformers', () => {
  const env = {
    allowLocalModels: false,
    allowRemoteModels: true,
    useBrowserCache: true,
    localModelPath: '',
    backends: {
      onnx: { wasm: { proxy: true } },
    },
  } as any;

  return {
    env,
    AutoTokenizer: {
      from_pretrained: vi.fn(),
    },
    AutoModel: {
      from_pretrained: vi.fn(),
    },
  };
});

// Import after mocking
import { EmbeddingManager } from './embedding';
import { env as mockedEnv, AutoTokenizer, AutoModel } from '@xenova/transformers';

describe('EmbeddingManager', () => {
  const queryPath = path.join('models', 'dragon', 'chat_query_encoder');
  const contextPath = path.join('models', 'dragon', 'chat_key_encoder');

  const queryModelName = path.basename(queryPath);
  const contextModelName = path.basename(contextPath);

  beforeEach(() => {
    vi.clearAllMocks();

    // reset env to defaults (the mock object is shared between tests)
    mockedEnv.allowLocalModels = false;
    mockedEnv.allowRemoteModels = true;
    mockedEnv.useBrowserCache = true;
    mockedEnv.localModelPath = '';
    mockedEnv.backends.onnx.wasm.proxy = true;
  });

  it('initializes tokenizer and models with local paths and configures env', async () => {
    // tokenizer returns tokenized input objects with onnxruntime-like fields
    const tokenizerFn = vi.fn(async () => ({
      input_ids: { dataLocation: 'cpu', cpuData: new Float32Array([0, 1]) },
      attention_mask: { dataLocation: 'cpu', cpuData: new Float32Array([1, 1]) },
    }));

    // Models are simple callable functions
    const queryModel = vi.fn(async () => ({
      last_hidden_state: {
        dims: [1, 1, 3],
        data: new Float32Array([0.1, 0.2, 0.3]),
      },
    }));
    const contextModel = vi.fn(async () => ({
      last_hidden_state: {
        dims: [1, 1, 3],
        data: new Float32Array([0.4, 0.5, 0.6]),
      },
    }));

    // Configure factory returns
    (AutoTokenizer.from_pretrained as any)
      .mockResolvedValue(tokenizerFn);
    (AutoModel.from_pretrained as any)
      .mockResolvedValueOnce(queryModel)
      .mockResolvedValueOnce(contextModel);

    const manager = new EmbeddingManager({
      chatQueryEncoderPath: queryPath,
      chatKeyEncoderPath: contextPath,
    });

    await manager.initialize();

    // env is configured
    expect(mockedEnv.allowLocalModels).toBe(true);
    expect(mockedEnv.allowRemoteModels).toBe(false);
    expect(mockedEnv.useBrowserCache).toBe(false);
    expect(mockedEnv.localModelPath).toBe(path.dirname(queryPath));
    expect(mockedEnv.backends.onnx.wasm.proxy).toBe(false);

    // tokenizer/model loading calls use model names and local-only option
    expect(AutoTokenizer.from_pretrained).toHaveBeenCalledWith(queryModelName, { local_files_only: true });
    expect(AutoModel.from_pretrained).toHaveBeenNthCalledWith(1, queryModelName, { local_files_only: true });
    expect(AutoModel.from_pretrained).toHaveBeenNthCalledWith(2, contextModelName, { local_files_only: true });

    // ready after initialization
    expect(manager.isReady()).toBe(true);
  });

  it('embedQuery returns first token [CLS] embedding and fixes tensor fields', async () => {
    // Arrange mocks
    const tokenizerFn = vi.fn(async () => ({
      input_ids: { dataLocation: 'cpu', cpuData: new Float32Array([1, 2]) },
      attention_mask: { dataLocation: 'cpu', cpuData: new Float32Array([1, 1]) },
    }));

    const queryOutput = {
      last_hidden_state: {
        dims: [1, 2, 4], // hidden size = 4
        data: new Float32Array([10, 20, 30, 40, 50, 60, 70, 80]),
      },
    };
    const queryModel = vi.fn(async () => queryOutput);
    const contextModel = vi.fn(async () => ({
      last_hidden_state: { dims: [1, 1, 4], data: new Float32Array([0, 0, 0, 0]) },
    }));

    (AutoTokenizer.from_pretrained as any).mockResolvedValue(tokenizerFn);
    (AutoModel.from_pretrained as any)
      .mockResolvedValueOnce(queryModel)
      .mockResolvedValueOnce(contextModel);

    const manager = new EmbeddingManager({
      chatQueryEncoderPath: queryPath,
      chatKeyEncoderPath: contextPath,
    });
    await manager.initialize();

    const result = await manager.embedQuery('hello world');
    expect(result).toEqual([10, 20, 30, 40]);

    // Ensure fixTensorLocation added expected fields before model call
    expect(queryModel).toHaveBeenCalledTimes(1);
    const inputsPassed = (queryModel.mock.calls[0] as any)[0];
    expect(inputsPassed.input_ids.location).toBe('cpu');
    expect(inputsPassed.input_ids.data).toBeInstanceOf(Float32Array);
    expect(Array.from(inputsPassed.input_ids.data)).toEqual([1, 2]);
  });

  it('embedContext returns first token embedding using cpuData when data missing', async () => {
    const tokenizerFn = vi.fn(async () => ({
      input_ids: { dataLocation: 'cpu', cpuData: new Float32Array([3, 4]) },
      attention_mask: { dataLocation: 'cpu', cpuData: new Float32Array([1, 1]) },
    }));

    const queryModel = vi.fn(async () => ({
      last_hidden_state: { dims: [1, 1, 3], data: new Float32Array([1, 2, 3]) },
    }));
    const contextOutput = {
      last_hidden_state: {
        dims: [1, 1, 3],
        cpuData: new Float32Array([4, 5, 6]),
      },
    };
    const contextModel = vi.fn(async () => contextOutput);

    (AutoTokenizer.from_pretrained as any).mockResolvedValue(tokenizerFn);
    (AutoModel.from_pretrained as any)
      .mockResolvedValueOnce(queryModel)
      .mockResolvedValueOnce(contextModel);

    const manager = new EmbeddingManager({
      chatQueryEncoderPath: queryPath,
      chatKeyEncoderPath: contextPath,
    });
    await manager.initialize();

    const result = await manager.embedContext('context text');
    expect(result).toEqual([4, 5, 6]);
  });

  it('throws when embedding before initialization', async () => {
    const manager = new EmbeddingManager({
      chatQueryEncoderPath: queryPath,
      chatKeyEncoderPath: contextPath,
    });

    await expect(manager.embedQuery('x')).rejects.toThrow('Query encoder not initialized');
    await expect(manager.embedContext('x')).rejects.toThrow('Context encoder not initialized');
  });

  it('cleanup disposes models and resets readiness', async () => {
    const tokenizerFn = vi.fn(async () => ({}));

    // Create callable model functions with dispose methods
    const queryModel: any = vi.fn(async () => ({
      last_hidden_state: { dims: [1, 1, 1], data: new Float32Array([0]) },
    }));
    queryModel.dispose = vi.fn(async () => {});

    const contextModel: any = vi.fn(async () => ({
      last_hidden_state: { dims: [1, 1, 1], data: new Float32Array([0]) },
    }));
    contextModel.dispose = vi.fn(async () => {});

    (AutoTokenizer.from_pretrained as any).mockResolvedValue(tokenizerFn);
    (AutoModel.from_pretrained as any)
      .mockResolvedValueOnce(queryModel)
      .mockResolvedValueOnce(contextModel);

    const manager = new EmbeddingManager({
      chatQueryEncoderPath: queryPath,
      chatKeyEncoderPath: contextPath,
    });
    await manager.initialize();
    expect(manager.isReady()).toBe(true);

    await manager.cleanup();

    expect(queryModel.dispose).toHaveBeenCalledTimes(1);
    expect(contextModel.dispose).toHaveBeenCalledTimes(1);
    expect(manager.isReady()).toBe(false);
  });
});
