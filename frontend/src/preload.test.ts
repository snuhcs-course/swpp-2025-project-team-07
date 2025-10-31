import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposures: Record<string, any> = {};
const ipcListeners: Record<string, Array<(...args: any[]) => unknown>> = {};

const exposeInMainWorld = vi.fn((key: string, value: unknown) => {
  exposures[key] = value;
});
const ipcInvokeMock = vi.fn(async () => undefined);
const ipcOnMock = vi.fn((channel: string, listener: (...args: any[]) => unknown) => {
  (ipcListeners[channel] ??= []).push(listener);
});
const ipcRemoveListenerMock = vi.fn((channel: string, listener: (...args: any[]) => unknown) => {
  const listeners = ipcListeners[channel];
  if (listeners) {
    ipcListeners[channel] = listeners.filter((registered) => registered !== listener);
  }
});

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: ipcInvokeMock,
    on: ipcOnMock,
    removeListener: ipcRemoveListenerMock,
  },
}));

const getDisplayMediaMock = vi.fn(async (): Promise<any> => ({
  id: 'stream',
  getTracks: () => [{ stop: vi.fn() }],
}));

class MediaRecorderMock {
  static instances: MediaRecorderMock[] = [];

  public ondataavailable?: (event: { data: Blob }) => void;
  public onstop?: () => void;
  public readonly start = vi.fn();
  public readonly stop = vi.fn(() => {
    this.onstop?.();
  });

  constructor(public readonly stream: any, public readonly options: MediaRecorderOptions) {
    MediaRecorderMock.instances.push(this);
  }
}

beforeEach(() => {
  vi.resetModules();

  Object.keys(exposures).forEach((key) => delete exposures[key]);
  Object.keys(ipcListeners).forEach((key) => delete ipcListeners[key]);
  exposeInMainWorld.mockClear();
  ipcInvokeMock.mockClear();
  ipcOnMock.mockClear();
  ipcRemoveListenerMock.mockClear();
  getDisplayMediaMock.mockReset();
  getDisplayMediaMock.mockResolvedValue({
    id: 'stream',
    getTracks: () => [{ stop: vi.fn() }],
  });
  MediaRecorderMock.instances.length = 0;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getDisplayMedia: getDisplayMediaMock,
    },
  });

  // @ts-expect-error - expose mock recorder globally for tests
  globalThis.MediaRecorder = MediaRecorderMock;
});

describe('preload script', () => {
  it('exposes recorder, llmAPI, and embeddingAPI to the renderer', async () => {
    await import('./preload');

    expect(exposeInMainWorld).toHaveBeenCalledWith('recorder', expect.any(Object));
    expect(exposeInMainWorld).toHaveBeenCalledWith('llmAPI', expect.any(Object));
    expect(exposeInMainWorld).toHaveBeenCalledWith('embeddingAPI', expect.any(Object));
    expect(exposures.recorder).toBeDefined();
    expect(exposures.llmAPI).toBeDefined();
    expect(exposures.embeddingAPI).toBeDefined();
  });

  it('starts and stops screen recording, forwarding saved data to the main process', async () => {
    ipcInvokeMock.mockResolvedValueOnce('C:/mock/output.webm');
    await import('./preload');
    const recorder = exposures.recorder;

    await recorder.start();
    const [instance] = MediaRecorderMock.instances;
    expect(getDisplayMediaMock).toHaveBeenCalled();
    expect(instance.start).toHaveBeenCalled();

    instance.ondataavailable?.({ data: new Blob(['chunk'], { type: 'video/webm' }) });
    await recorder.stop();

    expect(instance.stop).toHaveBeenCalled();
    expect(ipcInvokeMock).toHaveBeenCalledWith('rec:save-file', expect.any(Buffer));
  });

  it('ignores empty media chunks while recording', async () => {
    await import('./preload');
    const recorder = exposures.recorder;
    await recorder.start();
    const [instance] = MediaRecorderMock.instances;

    instance.ondataavailable?.({ data: new Blob([], { type: 'video/webm' }) });
    await recorder.stop();

    expect(MediaRecorderMock.instances.length).toBeGreaterThan(0);
  });

  it('proxies recorder helpers to IPC handlers', async () => {
    await import('./preload');
    const recorder = exposures.recorder;

    await recorder.listSources();
    expect(ipcInvokeMock).toHaveBeenCalledWith('rec:list-sources');

    ipcInvokeMock.mockClear();
    await recorder.chooseSource('source-1');
    expect(ipcInvokeMock).toHaveBeenCalledWith('rec:choose-source', 'source-1');
  });

  it('wires llm API helpers to ipcRenderer.invoke/on/removeListener', async () => {
    await import('./preload');
    const llmAPI = exposures.llmAPI;

    ipcInvokeMock.mockClear();
    await llmAPI.chat('hello');
    expect(ipcInvokeMock).toHaveBeenCalledWith('llm:chat', 'hello', undefined);

    ipcInvokeMock.mockClear();
    await llmAPI.streamChat('stream', { sessionId: 's' });
    expect(ipcInvokeMock).toHaveBeenCalledWith('llm:stream-start', 'stream', { sessionId: 's' });

    ipcInvokeMock.mockClear();
    await llmAPI.createSession('system');
    expect(ipcInvokeMock).toHaveBeenCalledWith('llm:create-session', 'system');

    ipcInvokeMock.mockClear();
    await llmAPI.clearSession('session-1');
    expect(ipcInvokeMock).toHaveBeenCalledWith('llm:clear-session', 'session-1');

    ipcInvokeMock.mockClear();
    await llmAPI.getModelInfo();
    expect(ipcInvokeMock).toHaveBeenCalledWith('llm:model-info');

    ipcInvokeMock.mockClear();
    await llmAPI.checkModelDownloaded();
    expect(ipcInvokeMock).toHaveBeenCalledWith('model:check-downloaded');

    ipcInvokeMock.mockClear();
    await llmAPI.startModelDownload();
    expect(ipcInvokeMock).toHaveBeenCalledWith('model:start-download');

    const chunkCallback = vi.fn();
    llmAPI.onStreamChunk(chunkCallback);
    expect(ipcOnMock).toHaveBeenCalledWith('llm:stream-chunk', expect.any(Function));

    llmAPI.offStreamChunk(chunkCallback);
    expect(ipcRemoveListenerMock).toHaveBeenCalledWith('llm:stream-chunk', chunkCallback);

    const streamChunkListener = ipcListeners['llm:stream-chunk']?.[0];
    await streamChunkListener?.({}, { content: 'chunk' });
    expect(chunkCallback).toHaveBeenCalledWith({ content: 'chunk' });

    const endCallback = vi.fn();
    llmAPI.onStreamEnd(endCallback);
    expect(ipcOnMock).toHaveBeenCalledWith('llm:stream-end', expect.any(Function));

    llmAPI.offStreamEnd(endCallback);
    expect(ipcRemoveListenerMock).toHaveBeenCalledWith('llm:stream-end', endCallback);

    const streamEndListener = ipcListeners['llm:stream-end']?.[0];
    await streamEndListener?.({}, 'session-42');
    expect(endCallback).toHaveBeenCalledWith('session-42');
  });

  it('wires model download subscriptions to ipcRenderer.on', async () => {
    await import('./preload');
    const llmAPI = exposures.llmAPI;

    const progress = vi.fn();
    llmAPI.onDownloadProgress(progress);
    expect(ipcOnMock).toHaveBeenCalledWith('model:download-progress', expect.any(Function));
    const progressListener = ipcListeners['model:download-progress']?.[0];
    await progressListener?.({}, { percent: 42 });
    expect(progress).toHaveBeenCalledWith({ percent: 42 });

    const complete = vi.fn();
    llmAPI.onDownloadComplete(complete);
    expect(ipcOnMock).toHaveBeenCalledWith('model:download-complete', expect.any(Function));
    const completeListener = ipcListeners['model:download-complete']?.[0];
    await completeListener?.();
    expect(complete).toHaveBeenCalled();

    const error = vi.fn();
    llmAPI.onDownloadError(error);
    expect(ipcOnMock).toHaveBeenCalledWith('model:download-error', expect.any(Function));
    const errorListener = ipcListeners['model:download-error']?.[0];
    await errorListener?.({}, 'failed');
    expect(error).toHaveBeenCalledWith('failed');

    const notFound = vi.fn();
    llmAPI.onModelNotFound(notFound);
    expect(ipcOnMock).toHaveBeenCalledWith('llm:model-not-found', expect.any(Function));
    const notFoundListener = ipcListeners['llm:model-not-found']?.[0];
    await notFoundListener?.();
    expect(notFound).toHaveBeenCalled();

    const ready = vi.fn();
    llmAPI.onLLMReady(ready);
    expect(ipcOnMock).toHaveBeenCalledWith('llm:ready', expect.any(Function));
    const readyListener = ipcListeners['llm:ready']?.[0];
    await readyListener?.();
    expect(ready).toHaveBeenCalled();

    const err = vi.fn();
    llmAPI.onLLMError(err);
    expect(ipcOnMock).toHaveBeenCalledWith('llm:error', expect.any(Function));
    const errorHandler = ipcListeners['llm:error']?.[0];
    await errorHandler?.({}, { message: 'm', error: 'e' });
    expect(err).toHaveBeenCalledWith({ message: 'm', error: 'e' });
  });

  it('exposes embedding helpers over IPC', async () => {
    await import('./preload');
    const embeddingAPI = exposures.embeddingAPI;

    ipcInvokeMock.mockClear();
    await embeddingAPI.embedQuery('query');
    expect(ipcInvokeMock).toHaveBeenCalledWith('embedding:query', 'query');

    ipcInvokeMock.mockClear();
    await embeddingAPI.embedContext('context');
    expect(ipcInvokeMock).toHaveBeenCalledWith('embedding:context', 'context');

    ipcInvokeMock.mockClear();
    await embeddingAPI.isReady();
    expect(ipcInvokeMock).toHaveBeenCalledWith('embedding:is-ready');
  });
});
