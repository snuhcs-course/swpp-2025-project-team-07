import { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, screen } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { LLMManager } from './llm/manager';
import { downloadFile } from './utils/downloader';
import { EmbeddingManager } from './llm/embedding';

let selectedSourceId: string | null = null;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const LLM_MODEL_INFO = {
  fileName: 'gemma-3-12b-it-Q4_0.gguf',
  directory: 'models',
  expectedSize: 6_909_282_656,
  url: 'https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q4_0.gguf'
};

const CHAT_QUERY_ENCODER_FILES = [
  {
    fileName: 'pytorch_model.bin',
    expectedSize: 438_000_000, // ~438MB
    url: 'https://huggingface.co/nvidia/dragon-multiturn-query-encoder/resolve/main/pytorch_model.bin'
  },
  {
    fileName: 'config.json',
    expectedSize: 675,
    url: 'https://huggingface.co/nvidia/dragon-multiturn-query-encoder/resolve/main/config.json'
  },
  {
    fileName: 'vocab.txt',
    expectedSize: 232_000, // ~232KB
    url: 'https://huggingface.co/nvidia/dragon-multiturn-query-encoder/resolve/main/vocab.txt'
  },
  {
    fileName: 'tokenizer_config.json',
    expectedSize: 28,
    url: 'https://huggingface.co/nvidia/dragon-multiturn-query-encoder/resolve/main/tokenizer_config.json'
  },
  {
    fileName: 'special_tokens_map.json',
    expectedSize: 112,
    url: 'https://huggingface.co/nvidia/dragon-multiturn-query-encoder/resolve/main/special_tokens_map.json'
  }
];

const CHAT_QUERY_ENCODER_INFO = {
  directory: 'embeddings/chat-query-encoder',
  files: CHAT_QUERY_ENCODER_FILES
};

const CHAT_KEY_ENCODER_FILES = [
  {
    fileName: 'pytorch_model.bin',
    expectedSize: 438_000_000, // ~438MB
    url: 'https://huggingface.co/nvidia/dragon-multiturn-context-encoder/resolve/main/pytorch_model.bin'
  },
  {
    fileName: 'config.json',
    expectedSize: 677,
    url: 'https://huggingface.co/nvidia/dragon-multiturn-context-encoder/resolve/main/config.json'
  },
  {
    fileName: 'vocab.txt',
    expectedSize: 232_000, // ~232KB
    url: 'https://huggingface.co/nvidia/dragon-multiturn-context-encoder/resolve/main/vocab.txt'
  },
  {
    fileName: 'tokenizer_config.json',
    expectedSize: 28,
    url: 'https://huggingface.co/nvidia/dragon-multiturn-context-encoder/resolve/main/tokenizer_config.json'
  },
  {
    fileName: 'special_tokens_map.json',
    expectedSize: 112,
    url: 'https://huggingface.co/nvidia/dragon-multiturn-context-encoder/resolve/main/special_tokens_map.json'
  }
];

const CHAT_KEY_ENCODER_INFO = {
  directory: 'embeddings/chat-key-encoder',
  files: CHAT_KEY_ENCODER_FILES
};

function getLLMModelPath(): string {
  // 개발용 로컬 경로 (기존 로직 유지)
  const devModelPath = path.join(process.cwd(), LLM_MODEL_INFO.directory, LLM_MODEL_INFO.fileName);
  if (existsSync(devModelPath)) {
    return devModelPath;
  }
  // 프로덕션용 userData 경로
  return path.join(
    app.getPath('userData'),
    LLM_MODEL_INFO.directory,
    LLM_MODEL_INFO.fileName
  );
}

/**
 * LLM 모델이 다운로드되었는지 확인합니다.
 */
function isLLMModelDownloaded(): boolean {
  return existsSync(getLLMModelPath());
}

/**
 * 임베딩 모델의 모든 파일이 다운로드되었는지 확인
 */
function isEmbeddingModelDownloaded(modelInfo: typeof CHAT_QUERY_ENCODER_INFO): boolean {
  return modelInfo.files.every(file => {
    const filePath = path.join(app.getPath('userData'), modelInfo.directory, file.fileName);
    return existsSync(filePath);
  });
}

/**
 * 임베딩 모델 디렉토리 경로 반환
 */
function getEmbeddingModelPath(modelInfo: typeof CHAT_QUERY_ENCODER_INFO): string {
  // 개발용 로컬 경로
  const devPath = path.join(process.cwd(), modelInfo.directory);
  if (existsSync(path.join(devPath, 'pytorch_model.bin'))) {
    return devPath;
  }
  // 프로덕션용 userData 경로
  return path.join(app.getPath('userData'), modelInfo.directory);
}

let llmManager: LLMManager | null = null;
let embeddingManager: EmbeddingManager | null = null;
let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Calculate 70% of viewport
  const windowWidth = Math.floor(width * 0.8);
  const windowHeight = Math.floor(height * 0.8);

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Show window once content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  return mainWindow;
};

// Initialize LLM Manager
async function initializeLLM() {
  if (llmManager) {
    console.log('LLM Manager already initialized');
    return;
  }

  try {
    const llmPath = getLLMModelPath();
    const chatQueryEncoderPath = getEmbeddingModelPath(CHAT_QUERY_ENCODER_INFO);
    const chatKeyEncoderPath = getEmbeddingModelPath(CHAT_KEY_ENCODER_INFO);

    console.log('Initializing LLM with model:', llmPath);
    
    // Initialize LLM
    llmManager = new LLMManager({
      modelPath: llmPath,
      onProgress: (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send('llm:loading-progress', progress);
        }
      }
    });
    await llmManager.initialize();
    
    // Initialize Embedding Manager separately
    console.log('Initializing Embedding Manager...');
    embeddingManager = new EmbeddingManager({
      chatQueryEncoderPath: chatQueryEncoderPath,
      chatKeyEncoderPath: chatKeyEncoderPath,
    });
    await embeddingManager.initialize();
    
    console.log('LLM and Embedding initialized successfully');

    if (mainWindow) {
      mainWindow.webContents.send('llm:ready');
    }
  } catch (error: any) {
    console.error('Failed to initialize LLM:', error);
    if (mainWindow) {
      mainWindow.webContents.send('llm:error', {
        message: 'Failed to load AI model',
        error: error.message
      });
    }
    throw error;
  }
}

// set to full screen recording
async function registerDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    let called = false;
    const safeCallback = (arg?: any) => {
      if (called) return;
      called = true;
      callback(arg);
    };

    desktopCapturer.getSources({types: ['screen'], thumbnailSize: { width: 0, height: 0 },}).then((sources) => { if (!sources.length) {
        console.error('[displayMedia] no screen sources');
        return safeCallback();
      }

      const primaryId = String(screen.getPrimaryDisplay().id);
  
      const byDisplayId = sources.find(s => s.display_id === primaryId);
      const byName = sources.find(s => /Entire Screen|Screen \d+/i.test(s.name));
      const pick = byDisplayId ?? byName ?? sources[0];

      safeCallback({ video: pick });
    })
    .catch((e) => {
      console.error('[displayMedia] handler error:', e);
      safeCallback();
    });
  });
}

// Setup IPC Handlers
function setupLLMHandlers() {
  // Chat handler (non-streaming)
  ipcMain.handle('llm:chat', async (_event, message: string, options?: any) => {
    if (!llmManager) throw new Error('LLM not initialized');
    return await llmManager.chat(message, options);
  });

  // Streaming chat handler
  ipcMain.handle('llm:stream-start', async (_event, message: string, options?: any) => {
    if (!llmManager) throw new Error('LLM not initialized');

    const sessionId = options?.sessionId || 'default';
    const streamId = options?.streamId || 'default';

    await llmManager.streamChat(message, {
      ...options,
      onChunk: (chunk: string) => {
        if (mainWindow) {
          mainWindow.webContents.send('llm:stream-chunk', {
            sessionId,
            streamId,
            chunk,
            done: false
          });
        }
      },
      onComplete: () => {
        if (mainWindow) {
          mainWindow.webContents.send('llm:stream-end', sessionId);
        }
      }
    });
  });

  // Session management
  ipcMain.handle('llm:create-session', async (_event, systemPrompt?: string) => {
    if (!llmManager) throw new Error('LLM not initialized');
    return await llmManager.createSession(systemPrompt);
  });

  ipcMain.handle('llm:clear-session', async (_event, sessionId: string) => {
    if (!llmManager) throw new Error('LLM not initialized');
    await llmManager.clearSession(sessionId);
  });

  // Model info
  ipcMain.handle('llm:model-info', async () => {
    if (!llmManager) throw new Error('LLM not initialized');
    return llmManager.getModelInfo();
  });

  ipcMain.handle('model:start-download', async (_event) => {
    if (!mainWindow) throw new Error('No window found');

    try {
      const downloadTasks = [];

      // 1. LLM 모델 다운로드 확인
      if (!isLLMModelDownloaded()) {
        downloadTasks.push({
          type: 'llm',
          name: 'Gemma-3-12B-IT (LLM)',
          files: [{
            fileName: LLM_MODEL_INFO.fileName,
            directory: LLM_MODEL_INFO.directory,
            url: LLM_MODEL_INFO.url,
            expectedSize: LLM_MODEL_INFO.expectedSize
          }]
        });
      }

      // 2. Query Encoder 다운로드 확인
      if (!isEmbeddingModelDownloaded(CHAT_QUERY_ENCODER_INFO)) {
        downloadTasks.push({
          type: 'chat-query-encoder',
          name: 'DRAGON Query Encoder',
          files: CHAT_QUERY_ENCODER_INFO.files.map(f => ({
            ...f,
            directory: CHAT_QUERY_ENCODER_INFO.directory
          }))
        });
      }

      // 3. Context Encoder 다운로드 확인
      if (!isEmbeddingModelDownloaded(CHAT_KEY_ENCODER_INFO)) {
        downloadTasks.push({
          type: 'chat-key-encoder',
          name: 'DRAGON Context Encoder',
          files: CHAT_KEY_ENCODER_INFO.files.map(f => ({
            ...f,
            directory: CHAT_KEY_ENCODER_INFO.directory
          }))
        });
      }

      if (downloadTasks.length === 0) {
        console.log('All models already downloaded');
        await initializeLLM();
        mainWindow.webContents.send('model:download-complete');
        return { success: true };
      }

      console.log(`Need to download ${downloadTasks.length} model(s)`);

      // 4. 모든 필요한 파일 다운로드
      for (const task of downloadTasks) {
        console.log(`\n=== Downloading ${task.name} ===`);
        
        for (const file of task.files) {
          console.log(`  Downloading: ${file.fileName}`);
          
          try {
            await downloadFile(mainWindow, {
              downloadUrl: file.url,
              targetFileName: file.fileName,
              targetDirectory: file.directory,
              expectedSize: file.expectedSize,
              modelName: `${task.name} - ${file.fileName}`
            });
            
            console.log(`  ✓ ${file.fileName} downloaded`);
            
          } catch (downloadError: any) {
            console.error(`  ✗ Failed to download ${file.fileName}:`, downloadError.message);
            throw new Error(`Failed to download ${task.name} (${file.fileName}): ${downloadError.message}`);
          }
        }
        
        console.log(`✓ ${task.name} complete\n`);
        
        // 모델 간 짧은 대기
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('=== All models downloaded successfully ===\n');

      // 5. 모든 다운로드 완료 후 LLM 초기화
      await initializeLLM();

      mainWindow.webContents.send('model:download-complete');
      return { success: true };

    } catch (error: any) {
      console.error('\n=== Download failed ===');
      console.error(error);
      mainWindow.webContents.send('model:download-error', error.message);
      return { success: false, error: error.message };
    }
  });

  // Check if model is downloaded
  ipcMain.handle('model:check-downloaded', async () => {
    const llmDownloaded = isLLMModelDownloaded();
    const chatQueryEncoderDownloaded = isEmbeddingModelDownloaded(CHAT_QUERY_ENCODER_INFO);
    const chatKeyEncoderDownloaded = isEmbeddingModelDownloaded(CHAT_KEY_ENCODER_INFO);

    return {
      models: {
        llm: { 
          name: 'Gemma-3-12B-IT (LLM)',
          downloaded: llmDownloaded 
        },
        queryEncoder: {
          name: 'DRAGON Query Encoder',
          downloaded: chatQueryEncoderDownloaded
        },
        contextEncoder: {
          name: 'DRAGON Context Encoder',
          downloaded: chatKeyEncoderDownloaded
        }
      },
      downloaded: llmDownloaded && chatQueryEncoderDownloaded && chatKeyEncoderDownloaded,
      initialized: llmManager !== null
    };
  });

  // Embedding handlers
  ipcMain.handle('embedding:query', async (_event, text: string) => {
    if (!embeddingManager) throw new Error('Embedding manager not initialized');
    return await embeddingManager.embedQuery(text);
  });

  ipcMain.handle('embedding:context', async (_event, text: string) => {
    if (!embeddingManager) throw new Error('Embedding manager not initialized');
    return await embeddingManager.embedContext(text);
  });

  ipcMain.handle('embedding:is-ready', async () => {
    return embeddingManager?.isReady() ?? false;
  });

  console.log('LLM and Embedding IPC handlers registered');
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  await registerDisplayMediaHandler();
  createWindow();

  // Setup IPC handlers first
  setupLLMHandlers();

  // [수정] 모든 모델이 다운로드되었는지 확인
  const allModelsReady = isLLMModelDownloaded() &&
                         isEmbeddingModelDownloaded(CHAT_QUERY_ENCODER_INFO) &&
                         isEmbeddingModelDownloaded(CHAT_KEY_ENCODER_INFO);

  if (allModelsReady) {
    console.log('All models found, initializing LLM...');
    try {
      await initializeLLM();
    } catch (error) {
      console.error('LLM initialization failed:', error);
      // App will still run, but LLM features won't work
    }
  } else {
    console.log('One or more models not found. User will need to download them.');
    // Notify the renderer that model needs to be downloaded
    if (mainWindow) {
      // 이 이벤트는 preload.ts에 정의되어 있음
      mainWindow.webContents.send('llm:model-not-found');
    }
  }
});

// Cleanup on app quit
app.on('before-quit', async () => {
  if (llmManager) {
    console.log('Cleaning up LLM Manager...');
    await llmManager.cleanup();
  }
  
  if (embeddingManager) {
    console.log('Cleaning up Embedding Manager...');
    await embeddingManager.cleanup();
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

ipcMain.handle('rec:list-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    fetchWindowIcons: true,
    thumbnailSize: { width: 280, height: 180 },
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    appIconDataUrl: s.appIcon?.toDataURL?.() ?? null,
  }));
});

ipcMain.handle('rec:choose-source', (_e, id: string) => {
  selectedSourceId = id;
  return true;
});

ipcMain.handle('rec:save-file', async (_e, data: Buffer) => {
  const videos = app.getPath('videos'); // macOS: ~/Movies
  const defaultDir = path.join(videos, 'PrivateGPT-Recordings');
  await fs.mkdir(defaultDir, { recursive: true });
  const defaultPath = path.join(
    defaultDir,
    `Recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
  );

  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save recording',
    defaultPath,
    filters: [{ name: 'WebM Video', extensions: ['webm'] }],
  });
  if (canceled || !filePath) return null;

  await fs.writeFile(filePath, data);
  return filePath;
});
