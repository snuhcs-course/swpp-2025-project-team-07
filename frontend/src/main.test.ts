// import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// const mockIpcHandlers = new Map<string, (...args: any[]) => any>();
// const mockWindows: any[] = [];
// const mockAppHandlers = new Map<string, ((...args: any[]) => void)[]>();
// let displayMediaRequestHandler: ((request: unknown, callback: (response?: unknown) => void) => void) | null = null;

// class MockBrowserWindow {
//   static getAllWindows = vi.fn(() => mockWindows);

//   public readonly webContents = {
//     send: vi.fn(),
//     openDevTools: vi.fn(),
//   };

//   public readonly loadURL = vi.fn();
//   public readonly loadFile = vi.fn();
//   public readonly show = vi.fn();
//   public readonly eventHandlers: Record<string, (...args: any[]) => void> = {};
//   public readonly once = vi.fn((event: string, handler: (...args: any[]) => void) => {
//     this.eventHandlers[event] = handler;
//   });
//   public readonly on = vi.fn((event: string, handler: (...args: any[]) => void) => {
//     this.eventHandlers[event] = handler;
//   });

//   constructor(public readonly options: any) {
//     mockWindows.push(this);
//   }

//   trigger(event: string, ...args: any[]) {
//     this.eventHandlers[event]?.(...args);
//   }
// }

// const appOn = vi.fn((event: string, handler: (...args: any[]) => void) => {
//   const existing = mockAppHandlers.get(event) ?? [];
//   existing.push(handler);
//   mockAppHandlers.set(event, existing);
// });

// const appGetPath = vi.fn((name: string) => `C:/mock/${name}`);
// const appQuit = vi.fn();

// const desktopCapturerGetSources = vi.fn(async () => [
//   {
//     id: 'primary-source',
//     name: 'Entire Screen',
//     display_id: 'primary-display',
//     thumbnail: { toDataURL: () => 'thumb-primary' },
//     appIcon: undefined,
//   },
//   {
//     id: 'fallback-source',
//     name: 'Screen 2',
//     display_id: 'secondary-display',
//     thumbnail: { toDataURL: () => 'thumb-fallback' },
//     appIcon: { toDataURL: () => 'icon-fallback' },
//   },
// ]);

// const dialogShowSaveDialog = vi.fn(async () => ({ filePath: 'C:/mock/output.webm', canceled: false }));

// const sessionSetDisplayMediaRequestHandler = vi.fn((handler: typeof displayMediaRequestHandler) => {
//   displayMediaRequestHandler = handler;
// });

// const screenGetPrimaryDisplay = vi.fn(() => ({
//   id: 'primary-display',
//   workAreaSize: { width: 1200, height: 800 },
// }));

// const ipcMainHandle = vi.fn((channel: string, handler: (...args: any[]) => any) => {
//   mockIpcHandlers.set(channel, handler);
// });

// const electronModule = {
//   app: {
//     on: appOn,
//     getPath: appGetPath,
//     quit: appQuit,
//     isPackaged: false,
//   },
//   BrowserWindow: MockBrowserWindow as unknown as typeof import('electron').BrowserWindow,
//   ipcMain: {
//     handle: ipcMainHandle,
//   } as unknown as import('electron').IpcMain,
//   dialog: {
//     showSaveDialog: dialogShowSaveDialog,
//   },
//   session: {
//     defaultSession: {
//       setDisplayMediaRequestHandler: sessionSetDisplayMediaRequestHandler,
//     },
//   },
//   desktopCapturer: {
//     getSources: desktopCapturerGetSources,
//   },
//   screen: {
//     getPrimaryDisplay: screenGetPrimaryDisplay,
//   },
//   __mock: {
//     reset: () => {
//       mockIpcHandlers.clear();
//       mockWindows.length = 0;
//       mockAppHandlers.clear();
//       displayMediaRequestHandler = null;
//       MockBrowserWindow.getAllWindows.mockClear();
//       appOn.mockClear();
//       appGetPath.mockClear();
//       appQuit.mockClear();
//       desktopCapturerGetSources.mockClear();
//       dialogShowSaveDialog.mockClear();
//       sessionSetDisplayMediaRequestHandler.mockClear();
//       screenGetPrimaryDisplay.mockClear();
//       ipcMainHandle.mockClear();
//     },
//     getHandlers: () => mockIpcHandlers,
//     getWindows: () => mockWindows,
//     getDisplayMediaHandler: () => displayMediaRequestHandler,
//     appHandlers: mockAppHandlers,
//   },
// };

// vi.mock('electron', () => electronModule);
// vi.mock('electron-squirrel-startup', () => ({ default: false }));

// const downloadFileMock = vi.fn(async () => undefined);
// vi.mock('./utils/downloader', () => ({ downloadFile: downloadFileMock }));

// const mockLLMInstance = {
//   initialize: vi.fn(async () => undefined),
//   chat: vi.fn(async (message: string) => `response:${message}`),
//   streamChat: vi.fn(async (_message: string, options?: { onChunk?: (chunk: string) => void; onComplete?: () => void }) => {
//     options?.onChunk?.('chunk');
//     options?.onComplete?.();
//   }),
//   createSession: vi.fn(async (prompt?: string) => `session:${prompt ?? 'default'}`),
//   clearSession: vi.fn(async () => undefined),
//   getModelInfo: vi.fn(() => ({ name: 'Mock Model' })),
//   cleanup: vi.fn(async () => undefined),
// };

// const mockEmbeddingInstance = {
//   initialize: vi.fn(async () => undefined),
//   embedQuery: vi.fn(async () => [0.1, 0.2]),
//   embedContext: vi.fn(async () => [0.3, 0.4]),
//   isReady: vi.fn(async () => true),
//   cleanup: vi.fn(async () => undefined),
// };

// const llmConstructor = vi.fn();
// const embeddingConstructor = vi.fn();

// vi.mock('./llm/manager', () => ({
//   LLMManager: class {
//     constructor(options: unknown) {
//       llmConstructor(options);
//     }

//     initialize = mockLLMInstance.initialize;
//     chat = mockLLMInstance.chat;
//     streamChat = mockLLMInstance.streamChat;
//     createSession = mockLLMInstance.createSession;
//     clearSession = mockLLMInstance.clearSession;
//     getModelInfo = mockLLMInstance.getModelInfo;
//     cleanup = mockLLMInstance.cleanup;
//   },
// }));

// vi.mock('./llm/embedding', () => ({
//   EmbeddingManager: class {
//     constructor(options: unknown) {
//       embeddingConstructor(options);
//     }

//     initialize = mockEmbeddingInstance.initialize;
//     embedQuery = mockEmbeddingInstance.embedQuery;
//     embedContext = mockEmbeddingInstance.embedContext;
//     isReady = mockEmbeddingInstance.isReady;
//     cleanup = mockEmbeddingInstance.cleanup;
//   },
// }));

// const existsSyncMock = vi.fn(() => false);
// vi.mock('node:fs', () => ({
//   existsSync: existsSyncMock,
//   default: { existsSync: existsSyncMock },
// }));

// const mkdirMock = vi.fn(async () => undefined);
// const writeFileMock = vi.fn(async () => undefined);
// vi.mock('node:fs/promises', () => ({
//   default: {
//     mkdir: mkdirMock,
//     writeFile: writeFileMock,
//   },
//   mkdir: mkdirMock,
//   writeFile: writeFileMock,
// }));

// const resetMocks = () => {
//   electronModule.__mock.reset();
//   downloadFileMock.mockReset();
//   downloadFileMock.mockResolvedValue(undefined);
//   existsSyncMock.mockReset();
//   existsSyncMock.mockImplementation(() => false);
//   mkdirMock.mockReset();
//   mkdirMock.mockImplementation(async () => undefined);
//   writeFileMock.mockReset();
//   writeFileMock.mockImplementation(async () => undefined);
//   mockLLMInstance.initialize.mockClear();
//   mockLLMInstance.chat.mockClear();
//   mockLLMInstance.streamChat.mockClear();
//   mockLLMInstance.createSession.mockClear();
//   mockLLMInstance.clearSession.mockClear();
//   mockLLMInstance.getModelInfo.mockClear();
//   mockLLMInstance.cleanup.mockClear();
//   mockEmbeddingInstance.initialize.mockClear();
//   mockEmbeddingInstance.embedQuery.mockClear();
//   mockEmbeddingInstance.embedContext.mockClear();
//   mockEmbeddingInstance.isReady.mockClear();
//   mockEmbeddingInstance.cleanup.mockClear();
//   llmConstructor.mockClear();
//   embeddingConstructor.mockClear();
// };

// beforeEach(() => {
//   vi.resetModules();
//   resetMocks();
//   (globalThis as any).MAIN_WINDOW_VITE_DEV_SERVER_URL = undefined;
//   (globalThis as any).MAIN_WINDOW_VITE_NAME = 'main_window';
// });

// afterEach(() => {
//   vi.useRealTimers();
// });

// describe('main process module', () => {
//   it('creates a browser window and loads development URL when available', async () => {
//     (globalThis as any).MAIN_WINDOW_VITE_DEV_SERVER_URL = 'http://localhost:5173';
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;

//     const window = __test__.createWindow();
//     expect(window).toBeInstanceOf(MockBrowserWindow);

//     const [instance] = electronModule.__mock.getWindows();
//     expect(instance.options.width).toBe(960);
//     expect(instance.options.height).toBe(640);
//     expect(instance.loadURL).toHaveBeenCalledWith('http://localhost:5173');

//     instance.trigger('ready-to-show');
//     expect(instance.show).toHaveBeenCalled();
//   });

//   it('falls back to loading bundled HTML when dev server URL is missing', async () => {
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;

//     const window = __test__.createWindow();
//     expect(window.loadFile).toHaveBeenCalled();
//   });

//   it('registers display media handler and chooses primary screen', async () => {
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;

//     await __test__.registerDisplayMediaHandler();
//     const handler = electronModule.__mock.getDisplayMediaHandler();
//     expect(handler).toBeTypeOf('function');

//     const callback = vi.fn();
//     await handler?.({}, callback);
//     expect(desktopCapturerGetSources).toHaveBeenCalled();
//     expect(callback).toHaveBeenCalledWith({ video: expect.objectContaining({ id: 'primary-source' }) });
//   });

//   it('handles errors from display media handler gracefully', async () => {
//     desktopCapturerGetSources.mockRejectedValueOnce(new Error('capture failed'));

//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     await __test__.registerDisplayMediaHandler();

//     const handler = electronModule.__mock.getDisplayMediaHandler();
//     const callback = vi.fn();
//     await handler?.({}, callback);
//     await new Promise((resolve) => setTimeout(resolve, 0));
//     expect(callback).toHaveBeenCalledWith(undefined);
//   });

//   it('initializes LLM and embedding managers and notifies renderer', async () => {
//     existsSyncMock.mockReturnValue(false);
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     const window = __test__.createWindow();

//     await __test__.initializeLLM();

//     expect(llmConstructor).toHaveBeenCalled();
//     expect(mockLLMInstance.initialize).toHaveBeenCalled();
//     expect(embeddingConstructor).toHaveBeenCalled();
//     expect(mockEmbeddingInstance.initialize).toHaveBeenCalled();
//     expect(window.webContents.send).toHaveBeenCalledWith('llm:ready');
//   });

//   it('skips repeated LLM initialization calls', async () => {
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     __test__.createWindow();

//     await __test__.initializeLLM();
//     await __test__.initializeLLM();

//     expect(mockLLMInstance.initialize).toHaveBeenCalledTimes(1);
//   });

//   it('registers IPC handlers and proxies calls to LLM manager', async () => {
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     const window = __test__.createWindow();

//     await __test__.initializeLLM();
//     __test__.setupLLMHandlers();
//     const handlers = electronModule.__mock.getHandlers();

//     const chatResult = await handlers.get('llm:chat')?.({}, 'hello');
//     expect(chatResult).toBe('response:hello');

//     await handlers.get('llm:stream-start')?.({}, 'message', { sessionId: 's', streamId: 'stream' });
//     expect(mockLLMInstance.streamChat).toHaveBeenCalled();
//     expect(window.webContents.send).toHaveBeenCalledWith('llm:stream-chunk', expect.objectContaining({ sessionId: 's' }));
//     expect(window.webContents.send).toHaveBeenCalledWith('llm:stream-end', 's');

//     const sessionId = await handlers.get('llm:create-session')?.({}, 'system');
//     expect(sessionId).toBe('session:system');

//     await handlers.get('llm:clear-session')?.({}, 'session-1');
//     expect(mockLLMInstance.clearSession).toHaveBeenCalledWith('session-1');

//     const modelInfo = await handlers.get('llm:model-info')?.({});
//     expect(modelInfo).toEqual({ name: 'Mock Model' });
//   });

//   it('reports model download status', async () => {
//     existsSyncMock.mockImplementation((target: string) => target.includes('models') || target.includes('embeddings'));
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     __test__.setupLLMHandlers();

//     const status = await electronModule.__mock.getHandlers().get('model:check-downloaded')?.({});
//     expect(status).toMatchObject({
//       downloaded: true,
//       models: {
//         llm: { downloaded: true },
//         queryEncoder: { downloaded: true },
//         contextEncoder: { downloaded: true },
//       },
//     });
//   });

//   it('downloads models when missing and completes successfully', async () => {
//     existsSyncMock.mockReturnValue(false);
//     downloadFileMock.mockResolvedValue(undefined);
//     vi.useFakeTimers();

//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     const window = __test__.createWindow();
//     __test__.setupLLMHandlers();

//     const resultPromise = electronModule.__mock.getHandlers().get('model:start-download')?.({});
//     await vi.advanceTimersByTimeAsync(10_000);
//     const result = await resultPromise;

//     expect(downloadFileMock).toHaveBeenCalled();
//     expect(window.webContents.send).toHaveBeenCalledWith('model:download-complete');
//     expect(result).toEqual({ success: true });
//   });

//   it('notifies renderer when model download fails', async () => {
//     existsSyncMock.mockReturnValue(false);
//     downloadFileMock.mockRejectedValueOnce(new Error('download failed'));
//     vi.useFakeTimers();

//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     const window = __test__.createWindow();
//     __test__.setupLLMHandlers();

//     const resultPromise = electronModule.__mock.getHandlers().get('model:start-download')?.({});
//     await vi.advanceTimersByTimeAsync(10_000);
//     const result = await resultPromise;

//     expect(window.webContents.send).toHaveBeenCalledWith('model:download-error', expect.stringContaining('download failed'));
//     expect(result).toEqual({ success: false, error: expect.stringContaining('download failed') });
//   });

//   it('returns available recording sources and handles selection', async () => {
//     const mainModule = await import('./main');
//     await mainModule.__test__.createWindow();

//     const listHandler = electronModule.__mock.getHandlers().get('rec:list-sources');
//     const chooseHandler = electronModule.__mock.getHandlers().get('rec:choose-source');

//     const sources = await listHandler?.({});
//     expect(sources).toHaveLength(2);
//     expect(sources?.[0]).toMatchObject({ id: 'primary-source', name: 'Entire Screen' });

//     const chooseResult = await chooseHandler?.({}, 'primary-source');
//     expect(chooseResult).toBe(true);
//     expect(mainModule.__test__.getSelectedSourceId()).toBe('primary-source');
//   });

//   it('saves recordings to disk when user selects a file path', async () => {
//     const mainModule = await import('./main');
//     await mainModule.__test__.createWindow();
//     const saveHandler = electronModule.__mock.getHandlers().get('rec:save-file');

//     const buffer = Buffer.from('video');
//     const result = await saveHandler?.({}, buffer);

//     expect(mkdirMock).toHaveBeenCalled();
//     expect(writeFileMock).toHaveBeenCalledWith('C:/mock/output.webm', buffer);
//     expect(result).toBe('C:/mock/output.webm');
//   });

//   it('returns null when recording save dialog is cancelled', async () => {
//     dialogShowSaveDialog.mockResolvedValueOnce({ filePath: undefined, canceled: true });
//     const mainModule = await import('./main');
//     await mainModule.__test__.createWindow();
//     const saveHandler = electronModule.__mock.getHandlers().get('rec:save-file');

//     const result = await saveHandler?.({}, Buffer.from('video'));
//     expect(result).toBeNull();
//   });

//   it('dispatches model-not-found message during ready event when models are missing', async () => {
//     existsSyncMock.mockReturnValue(false);
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;

//     const readyHandlers = electronModule.__mock.appHandlers.get('ready') ?? [];
//     await readyHandlers[0]?.();

//     const window = __test__.getMainWindow();
//     expect(window?.webContents.send).toHaveBeenCalledWith('llm:model-not-found');
//   });

//   it('cleans up managers during before-quit lifecycle event', async () => {
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     __test__.createWindow();
//     await __test__.initializeLLM();

//     const beforeQuitHandlers = electronModule.__mock.appHandlers.get('before-quit') ?? [];
//     await beforeQuitHandlers[0]?.();

//     expect(mockLLMInstance.cleanup).toHaveBeenCalled();
//     expect(mockEmbeddingInstance.cleanup).toHaveBeenCalled();
//   });

//   it('quits the application when all windows are closed on non-mac platforms', async () => {
//     // Mock process.platform to simulate a non-Mac platform
//     const originalPlatform = process.platform;
//     Object.defineProperty(process, 'platform', {
//       value: 'win32',
//       writable: true,
//       configurable: true,
//     });

//     try {
//       const mainModule = await import('./main');
//       const handlers = electronModule.__mock.appHandlers.get('window-all-closed') ?? [];
//       handlers[0]?.();
//       expect(appQuit).toHaveBeenCalled();
//     } finally {
//       // Restore original platform
//       Object.defineProperty(process, 'platform', {
//         value: originalPlatform,
//         writable: true,
//         configurable: true,
//       });
//     }
//   });

//   it('re-creates the main window when activate event fires without open windows', async () => {
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     __test__.resetState();
//     mockWindows.length = 0;

//     const activateHandlers = electronModule.__mock.appHandlers.get('activate') ?? [];
//     activateHandlers[0]?.();

//     expect(mockWindows.length).toBeGreaterThan(0);
//   });

//   it('prefers development model paths when assets exist locally', async () => {
//     existsSyncMock.mockImplementation((target: string) => target.includes('onnx/model_quantized.onnx') || target.includes('gemma-3-12b-it-Q4_0.gguf'));
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     const { constants } = __test__;

//     const llmPath = __test__.getLLMModelPath();
//     expect(llmPath.replace(/\\/g, '/')).toContain(constants.LLM_MODEL_INFO.directory);

//     const embeddingPath = __test__.getEmbeddingModelPath(constants.CHAT_QUERY_ENCODER_INFO);
//     expect(embeddingPath.replace(/\\/g, '/')).toContain(constants.CHAT_QUERY_ENCODER_INFO.directory);
//   });

//   it('resets internal state via test hooks', async () => {
//     const mainModule = await import('./main');
//     const { __test__ } = mainModule;
//     const window = __test__.createWindow();
//     await __test__.initializeLLM();

//     const chooseHandler = electronModule.__mock.getHandlers().get('rec:choose-source');
//     await chooseHandler?.({}, 'source-id');
//     expect(__test__.getSelectedSourceId()).toBe('source-id');
//     expect(__test__.getMainWindow()).toBe(window);
//     expect(__test__.getLLMManager()).not.toBeNull();
//     expect(__test__.getEmbeddingManager()).not.toBeNull();

//     const customWindow = new MockBrowserWindow({ width: 100, height: 100 });
//     __test__.setMainWindow(customWindow as unknown as import('electron').BrowserWindow);
//     expect(__test__.getMainWindow()).toBe(customWindow);

//     __test__.resetState();
//     expect(__test__.getMainWindow()).toBeNull();
//     expect(__test__.getLLMManager()).toBeNull();
//     expect(__test__.getEmbeddingManager()).toBeNull();
//   });
// });
