import { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, screen } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { LLMManager } from './llm/manager';
import { downloadFile } from './utils/downloader';
import { ChatEmbedder } from './embedders/ChatEmbedder';

let selectedSourceId: string | null = null;
let chatEmbedder: ChatEmbedder | null = null; 

function installDisplayMediaHook() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const chosen = sources.find(s => s.id === selectedSourceId) ?? sources[0];
    callback({ video: chosen });
  });
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// --- [추가된 함수] ---
// LLM 모델에 대한 정보를 한 곳에서 관리합니다.
const LLM_MODEL_INFO = {
  fileName: 'gemma-3-12b-it-Q4_0.gguf',
  directory: 'models',
  expectedSize: 6_909_282_656,
  url: 'https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-Q4_0.gguf'
};

/**
 * LLM 모델 파일의 전체 경로를 반환합니다.
 */
function getModelPath(): string {
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
function isModelDownloaded(): boolean {
  return existsSync(getModelPath());
}

let llmManager: LLMManager | null = null;
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
    const modelPath = getModelPath();
    console.log('Initializing LLM with model:', modelPath);

    llmManager = new LLMManager({
      modelPath: modelPath,
      embeddingModel: 'nvidia/dragon-multiturn-query-encoder', // 임베딩 모델 지정
      onProgress: (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send('llm:loading-progress', progress);
        }
      },
      // 임베딩 모델 다운로드/로딩 진행 상황
      onEmbeddingProgress: (status, progress) => {
        if (mainWindow) {
          mainWindow.webContents.send('embedding:loading-progress', {
            status,
            progress: progress || 0
          });
        }
        // console.log(`Embedding: ${status} ${progress ? `(${progress.toFixed(1)}%)` : ''}`);
      }
    });

    await llmManager.initialize();
    
    // LLM이 초기화된 후 ChatEmbedder 생성
    chatEmbedder = new ChatEmbedder(llmManager); 
    
    console.log('LLM and embedding model initialized successfully');

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

  // Embedding handlers
  ipcMain.handle('llm:createChatEmbedding', async (_event, text: string) => {
    if (!chatEmbedder) throw new Error('ChatEmbedder not initialized');
    return await chatEmbedder.embed(text);
  });

  // 직접 임베딩 생성 (ChatEmbedder 없이)
  ipcMain.handle('llm:createEmbedding', async (_event, text: string) => {
    if (!llmManager) throw new Error('LLM not initialized');
    return await llmManager.createEmbedding(text);
  });

  // 임베딩 모델 상태 확인
  ipcMain.handle('llm:embedding-ready', async () => {
    if (!llmManager) return false;
    return llmManager.isEmbeddingModelReady();
  });

  // setupLLMHandlers 함수 내부
  ipcMain.handle('model:start-download', async (_event) => {
    if (!mainWindow) throw new Error('No window found');

    try {
      const modelPath = await downloadFile(mainWindow, { // 함수명 변경
        downloadUrl: LLM_MODEL_INFO.url,
        targetFileName: LLM_MODEL_INFO.fileName,
        targetDirectory: LLM_MODEL_INFO.directory,
        expectedSize: LLM_MODEL_INFO.expectedSize,
        // onProgress 콜백은 downloader 내부에서 자동으로 처리됨
      });

      // Initialize LLM after download
      await initializeLLM();

      mainWindow.webContents.send('model:download-complete');
      return { success: true, path: modelPath };
    } catch (error: any) {
      mainWindow.webContents.send('model:download-error', error.message);
      return { success: false, error: error.message };
    }
  });

  // Check if model is downloaded
  ipcMain.handle('model:check-downloaded', async () => {
    return {
      downloaded: isModelDownloaded(),
      initialized: llmManager !== null,
      path: getModelPath()
    };
  });

  console.log('LLM IPC handlers registered');
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  installDisplayMediaHook();
  createWindow();

  // Setup IPC handlers first
  setupLLMHandlers();

  // Check if model exists and initialize
  if (isModelDownloaded()) {
    console.log('Model found, initializing LLM...');
    try {
      await initializeLLM();
    } catch (error) {
      console.error('LLM initialization failed:', error);
      // App will still run, but LLM features won't work until model is downloaded
    }
  } else {
    console.log('Model not found. User will need to download it.');
    // Notify the renderer that model needs to be downloaded
    if (mainWindow) {
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
