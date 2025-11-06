import { test, expect } from '@playwright/test';
import { launchElectronApp, closeElectronApp } from './helpers/electron';

test.describe('Main & Preload integration', () => {
  let app: Awaited<ReturnType<typeof launchElectronApp>>['app'] | null = null;
  let page: Awaited<ReturnType<typeof launchElectronApp>>['page'] | null = null;

  test.beforeEach(async () => {
    const launched = await launchElectronApp();
    app = launched.app;
    page = launched.page;
  });

  test.afterEach(async () => {
    if (app) {
      await closeElectronApp(app);
      app = null;
      page = null;
    }
  });

  test('preload exposes recorder, LLM, and embedding APIs', async () => {
    const exposure = await page!.evaluate(() => {
      const w = window as unknown as {
        recorder?: {
          listSources?: () => Promise<unknown>;
          chooseSource?: (id: string) => Promise<boolean>;
          start?: () => Promise<void>;
          stop?: () => Promise<void>;
        };
        llmAPI?: Record<string, unknown>;
        embeddingAPI?: Record<string, unknown>;
      };

      return {
        hasRecorder: typeof w.recorder === 'object' && w.recorder !== null,
        recorderFns: {
          listSources: typeof w.recorder?.listSources === 'function',
          chooseSource: typeof w.recorder?.chooseSource === 'function',
          start: typeof w.recorder?.start === 'function',
          stop: typeof w.recorder?.stop === 'function',
        },
        hasLLMAPI: typeof w.llmAPI === 'object' && w.llmAPI !== null,
        llmMethods: [
          'chat',
          'streamChat',
          'createSession',
          'clearSession',
          'getModelInfo',
          'checkModelDownloaded',
          'startModelDownload',
          'onDownloadProgress',
          'onDownloadComplete',
          'onDownloadError',
          'onModelNotFound',
          'onLLMReady',
          'onLLMError',
        ].every((key) => typeof (w.llmAPI as Record<string, unknown>)?.[key] === 'function'),
        hasEmbeddingAPI: typeof w.embeddingAPI === 'object' && w.embeddingAPI !== null,
        embeddingMethods: ['embedQuery', 'embedContext', 'isReady'].every(
          (key) => typeof (w.embeddingAPI as Record<string, unknown>)?.[key] === 'function',
        ),
      };
    });

    expect(exposure.hasRecorder).toBe(true);
    expect(exposure.recorderFns).toEqual({
      listSources: true,
      chooseSource: true,
      start: true,
      stop: true,
    });
    expect(exposure.hasLLMAPI).toBe(true);
    expect(exposure.llmMethods).toBe(true);
    expect(exposure.hasEmbeddingAPI).toBe(true);
    expect(exposure.embeddingMethods).toBe(true);
  });

  test('main process responds to recorder selection requests', async () => {
    const selectionResult = await page!.evaluate(async () => {
      const w = window as unknown as {
        recorder: { chooseSource: (id: string) => Promise<boolean> };
      };
      return await w.recorder.chooseSource('playwright-test-source');
    });

    expect(selectionResult).toBe(true);
  });

  test('main process reports model download status and embedding readiness', async () => {
    const status = await page!.evaluate(async () => {
      const w = window as unknown as {
        llmAPI: { checkModelDownloaded: () => Promise<unknown> };
        embeddingAPI: { isReady: () => Promise<boolean> };
      };

      const downloadStatus = await w.llmAPI.checkModelDownloaded();
      const embeddingReady = await w.embeddingAPI.isReady();

      return { downloadStatus, embeddingReady };
    });

    expect(typeof status.embeddingReady).toBe('boolean');
    expect(status.downloadStatus).toEqual(
      expect.objectContaining({
        models: expect.objectContaining({
          llm: expect.objectContaining({ name: expect.any(String), downloaded: expect.any(Boolean) }),
          queryEncoder: expect.objectContaining({ name: expect.any(String), downloaded: expect.any(Boolean) }),
          contextEncoder: expect.objectContaining({ name: expect.any(String), downloaded: expect.any(Boolean) }),
        }),
        downloaded: expect.any(Boolean),
        initialized: expect.any(Boolean),
      }),
    );
  });
});

