import { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, screen } from 'electron';
import fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { LLMManager } from './llm/manager';
import { downloadFile } from './utils/downloader';
import { EmbeddingManager } from './llm/embedding';
import * as fs from 'node:fs';
import * as https from 'node:https';
import { URL } from 'node:url';

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

const S3_BASE_URL = 'https://swpp-api.s3.amazonaws.com/static/embeddings/dragon';

const CHAT_QUERY_ENCODER_FILES = [
  {
    fileName: 'model_quantized.onnx',
    relativePath: 'onnx/model_quantized.onnx',
    expectedSize: 435_760_128, // 425,547KB = ~416MB
    url: `${S3_BASE_URL}/chat-query-encoder/onnx/model_quantized.onnx`
  },
  {
    fileName: 'config.json',
    relativePath: 'config.json',
    expectedSize: 1_024, // 1KB
    url: `${S3_BASE_URL}/chat-query-encoder/config.json`
  },
  {
    fileName: 'special_tokens_map.json',
    relativePath: 'special_tokens_map.json',
    expectedSize: 1_024, // 1KB
    url: `${S3_BASE_URL}/chat-query-encoder/special_tokens_map.json`
  },
  {
    fileName: 'tokenizer_config.json',
    relativePath: 'tokenizer_config.json',
    expectedSize: 2_048, // 2KB
    url: `${S3_BASE_URL}/chat-query-encoder/tokenizer_config.json`
  },
  {
    fileName: 'tokenizer.json',
    relativePath: 'tokenizer.json',
    expectedSize: 711_680, // 695KB
    url: `${S3_BASE_URL}/chat-query-encoder/tokenizer.json`
  },
  {
    fileName: 'vocab.txt',
    relativePath: 'vocab.txt',
    expectedSize: 232_448, // 227KB
    url: `${S3_BASE_URL}/chat-query-encoder/vocab.txt`
  }
];

const CHAT_QUERY_ENCODER_INFO = {
  directory: 'embeddings/chat-query-encoder',
  files: CHAT_QUERY_ENCODER_FILES
};

const CHAT_KEY_ENCODER_FILES = [
  {
    fileName: 'model_quantized.onnx',
    relativePath: 'onnx/model_quantized.onnx',
    expectedSize: 435_760_128, // 425,547KB = ~416MB
    url: `${S3_BASE_URL}/chat-key-encoder/onnx/model_quantized.onnx`
  },
  {
    fileName: 'config.json',
    relativePath: 'config.json',
    expectedSize: 1_024, // 1KB
    url: `${S3_BASE_URL}/chat-key-encoder/config.json`
  },
  {
    fileName: 'special_tokens_map.json',
    relativePath: 'special_tokens_map.json',
    expectedSize: 1_024, // 1KB
    url: `${S3_BASE_URL}/chat-key-encoder/special_tokens_map.json`
  },
  {
    fileName: 'tokenizer_config.json',
    relativePath: 'tokenizer_config.json',
    expectedSize: 2_048, // 2KB
    url: `${S3_BASE_URL}/chat-key-encoder/tokenizer_config.json`
  },
  {
    fileName: 'tokenizer.json',
    relativePath: 'tokenizer.json',
    expectedSize: 711_680, // 695KB
    url: `${S3_BASE_URL}/chat-key-encoder/tokenizer.json`
  },
  {
    fileName: 'vocab.txt',
    relativePath: 'vocab.txt',
    expectedSize: 232_448, // 227KB
    url: `${S3_BASE_URL}/chat-key-encoder/vocab.txt`
  }
];

const CHAT_KEY_ENCODER_INFO = {
  directory: 'embeddings/chat-key-encoder',
  files: CHAT_KEY_ENCODER_FILES
};

function getLLMModelPath(): string {
  const devModelPath = path.join(process.cwd(), LLM_MODEL_INFO.directory, LLM_MODEL_INFO.fileName);
  if (existsSync(devModelPath)) {
    return devModelPath;
  }
  return path.join(
    app.getPath('userData'),
    LLM_MODEL_INFO.directory,
    LLM_MODEL_INFO.fileName
  );
}

function isLLMModelDownloaded(): boolean {
  return existsSync(getLLMModelPath());
}

function isEmbeddingModelDownloaded(modelInfo: typeof CHAT_QUERY_ENCODER_INFO): boolean {
  return modelInfo.files.every(file => {
    const filePath = path.join(app.getPath('userData'), modelInfo.directory, file.relativePath);
    return existsSync(filePath);
  });
}

function getEmbeddingModelPath(modelInfo: typeof CHAT_QUERY_ENCODER_INFO): string {
  const devPath = path.join(process.cwd(), modelInfo.directory);
  if (existsSync(path.join(devPath, 'onnx/model_quantized.onnx'))) {
    return devPath;
  }
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

const VEMBED_FILE = 'model.onnx';
const VEMBED_URL  = 'https://huggingface.co/openai/clip-vit-base-patch32/resolve/12b36594d53414ecfba93c7200dbb7c7db3c900a/onnx/model.onnx?download=true';
const VEMBED_DIR  = path.join(app.getPath('userData'), 'models', 'clip-vit-b-32');
const VEMBED_PATH = path.join(VEMBED_DIR, VEMBED_FILE);


// Initialize Video Embed Model
function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function followRedirectsGet(
  urlStr: string,
  headers: Record<string, string>,
  onResponse: (res: https.IncomingMessage) => void,
  redirectCount = 0
) {
  if (redirectCount > 5) {
    throw new Error('Too many redirects');
  }

  const u = new URL(urlStr);
  const req = https.request(
    {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers,
    },
    (res) => {
      const status = res.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(status)) {
        const loc = res.headers.location;
        if (!loc) return onResponse(res); 
        const nextUrl = new URL(loc, u).toString();
        res.resume(); 
        followRedirectsGet(nextUrl, headers, onResponse, redirectCount + 1);
        return;
      }

      onResponse(res);
    }
  );

  req.on('error', (err) => onResponse(Object.assign(new https.IncomingMessage(req.socket), { statusCode: 500, statusMessage: String(err) }) as any));
  req.end();
}

function downloadWithProgress(
  url: string,
  dest: string,
  onProgress: (total: number, received: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest);

    const HF_TOKEN = '';

    const headers: Record<string, string> = {
      'User-Agent': 'CloneApp/1.0 (+electron)',
      'Accept': '*/*',
      'Connection': 'keep-alive',
    };
    if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

    followRedirectsGet(url, headers, (res) => {
      const status = res.statusCode || 0;
      if (status >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${status}`));
      }

      const total = Number(res.headers['content-length'] || 0);
      let received = 0;

      res.on('data', (chunk) => {
        received += chunk.length;
        try { onProgress(total, received); } catch {}
      });

      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      res.on('error', reject);
    });
  });
}

// Check whether the video embedding model is ready
ipcMain.handle('video-model:is-ready', async () => {
  try {
    return fs.existsSync(VEMBED_PATH) && fs.statSync(VEMBED_PATH).size > 0;
  } catch {
    return false;
  }
});

// Start downloading the video embedding model
ipcMain.handle('video-model:start-download', async () => {
  try {
    if (!VEMBED_URL) throw new Error('VITE_VEMBED_MODEL_URL is empty');

    ensureDir(VEMBED_DIR);
    if (fs.existsSync(VEMBED_PATH)) fs.unlinkSync(VEMBED_PATH);

    await downloadWithProgress(VEMBED_URL, VEMBED_PATH, (total, received) => {
      if (!mainWindow) return;
      const percent = total > 0 ? received / total : 0;
      mainWindow.webContents.send('video-model:progress', { percent, transferred: received, total });
    });

    if (mainWindow) mainWindow.webContents.send('video-model:complete');
    return { success: true };
  } catch (e: any) {
    if (mainWindow) mainWindow.webContents.send('video-model:error', String(e?.message || e));
    return { success: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('video-model:get-bytes', async () => {
  const buf = await fsp.readFile(VEMBED_PATH);
  return buf;
});

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

  // Model download handler (for download-on-first-run)
  ipcMain.handle('model:start-download', async (_event) => {
    if (!mainWindow) throw new Error('No window found');

    try {
      const downloadTasks = [];

      if (!isLLMModelDownloaded()) {
        downloadTasks.push({
          type: 'llm',
          name: 'Gemma-3-12B-IT (LLM)',
          files: [{
            fileName: LLM_MODEL_INFO.fileName,
            relativePath: LLM_MODEL_INFO.fileName,
            directory: LLM_MODEL_INFO.directory,
            url: LLM_MODEL_INFO.url,
            expectedSize: LLM_MODEL_INFO.expectedSize
          }]
        });
      }

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

      for (const task of downloadTasks) {
        console.log(`\n=== Downloading ${task.name} ===`);
        
        for (const file of task.files) {
          console.log(`  Downloading: ${file.relativePath}`);
          
          try {
            const targetPath = path.join(file.directory, file.relativePath);
            const targetDir = path.dirname(targetPath);
            
            await downloadFile(mainWindow, {
              downloadUrl: file.url,
              targetFileName: file.fileName,
              targetDirectory: targetDir,
              expectedSize: file.expectedSize,
              modelName: `${task.name} - ${file.fileName}`
            });
            
            console.log(`  ✓ ${file.relativePath} downloaded`);
            
          } catch (downloadError: any) {
            console.error(`  ✗ Failed to download ${file.relativePath}:`, downloadError.message);
            throw new Error(`Failed to download ${task.name} (${file.relativePath}): ${downloadError.message}`);
          }
        }
        
        console.log(`✓ ${task.name} complete\n`);
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('=== All models downloaded successfully ===\n');

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
  console.log('[userData]', app.getPath('userData'));

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
  await fsp.mkdir(defaultDir, { recursive: true });
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

  await fsp.writeFile(filePath, data);
  return filePath;
});
