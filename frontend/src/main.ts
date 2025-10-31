import { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, screen } from 'electron';
import fsp from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { OllamaManager } from './llm/ollama-manager';
import { downloadFile } from './utils/downloader';
import { EmbeddingManager } from './llm/embedding';
import { ElectronOllama } from 'electron-ollama';
import * as fs from 'node:fs';
import * as https from 'node:https';
import { URL } from 'node:url';

let selectedSourceId: string | null = null;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

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

let ollamaManager: OllamaManager | null = null;
let electronOllama: ElectronOllama | null = null;
let embeddingManager: EmbeddingManager | null = null;
let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Calculate 70% of viewport
  const windowWidth = width;
  const windowHeight = height;

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

// Initialize Ollama Server and Manager
async function initializeOllama() {
  if (ollamaManager) {
    console.log('Ollama Manager already initialized');
    return;
  }

  try {
    // Initialize ElectronOllama to manage the Ollama server
    electronOllama = new ElectronOllama({
      basePath: app.getPath('userData')
    });

    console.log('Checking if Ollama server is running...');
    const isRunning = await electronOllama.isRunning();

    if (!isRunning) {
      console.log('Downloading and preparing Ollama server...');
      if (mainWindow) {
        mainWindow.webContents.send('llm:loading-progress', 0.1);
      }

      let versionToUse: `v${number}.${number}.${number}` | null = null;

      try {
        // Try to get metadata for latest version
        console.log('Resolving latest Ollama version...');
        const metadata = await electronOllama.getMetadata('latest');
        console.log(`Latest Ollama version: ${metadata.version}`);
        versionToUse = metadata.version;
      } catch (metadataError: any) {
        // If GitHub API fails, try to find locally installed version
        console.warn('Failed to fetch Ollama metadata from GitHub:', metadataError.message);
        console.log('Looking for locally installed Ollama version...');

        const ollamaBasePath = path.join(app.getPath('userData'), 'ollama');
        const { readdir } = await import('node:fs/promises');

        if (existsSync(ollamaBasePath)) {
          const versions = await readdir(ollamaBasePath);
          if (versions.length > 0) {
            versionToUse = versions[0] as `v${number}.${number}.${number}`;
            console.log(`Using locally installed version: ${versionToUse}`);
          }
        }

        if (!versionToUse) {
          throw new Error('Cannot start Ollama: No version available (GitHub unreachable and no local installation)');
        }
      }

      // Check if binary exists, if not download it
      const isDownloaded = await electronOllama.isDownloaded(versionToUse);

      if (!isDownloaded) {
        console.log(`Downloading Ollama ${versionToUse}...`);
        await electronOllama.download(versionToUse, undefined, {
          log: (percent, msg) => {
            console.log(`[Ollama Download] ${percent}%: ${msg}`);
            if (mainWindow) {
              mainWindow.webContents.send('llm:loading-progress', percent / 100);
            }
          }
        });
      }

      // Set execute permissions on the binary
      const binPath = electronOllama.getBinPath(versionToUse);
      const ollamaBinary = path.join(binPath, electronOllama.getExecutableName(electronOllama.currentPlatformConfig()));

      if (existsSync(ollamaBinary)) {
        console.log('Setting execute permissions on Ollama binary...');
        const { exec } = await import('child_process');
        await new Promise<void>((resolve, reject) => {
          exec(`chmod +x "${ollamaBinary}"`, (error) => {
            if (error) {
              console.error('Failed to set execute permissions:', error);
              reject(error);
            } else {
              console.log('Execute permissions set successfully');
              resolve();
            }
          });
        });
      } else {
        throw new Error(`Ollama binary not found at: ${ollamaBinary}`);
      }

      // Now start the server
      console.log('Starting Ollama server...');
      await electronOllama.serve(versionToUse, {
        serverLog: (msg) => console.log('[Ollama Server]', msg)
      });

      console.log('Ollama server started successfully');
    } else {
      console.log('Ollama server is already running');
    }

    // Initialize Ollama Manager
    ollamaManager = new OllamaManager({
      onProgress: (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send('llm:loading-progress', progress);
        }
      }
    });

    await ollamaManager.initialize();

    // Check if model is available
    const hasModel = await ollamaManager.isModelAvailable();
    if (!hasModel) {
      console.log('Gemma 3 model not found, needs to be pulled');
      if (mainWindow) {
        mainWindow.webContents.send('llm:model-not-found');
      }
      return;
    }

    console.log('Ollama and Gemma 3 initialized successfully');

    // Initialize Embedding Manager separately
    const chatQueryEncoderPath = getEmbeddingModelPath(CHAT_QUERY_ENCODER_INFO);
    const chatKeyEncoderPath = getEmbeddingModelPath(CHAT_KEY_ENCODER_INFO);

    console.log('Initializing Embedding Manager...');
    console.log('chatQueryEncoderPath:', chatQueryEncoderPath);
    console.log('chatKeyEncoderPath:', chatKeyEncoderPath);

    embeddingManager = new EmbeddingManager({
      chatQueryEncoderPath: chatQueryEncoderPath,
      chatKeyEncoderPath: chatKeyEncoderPath,
    });

    try {
      await embeddingManager.initialize();
      console.log('✓ Embedding Manager initialized successfully');
    } catch (embeddingError: any) {
      console.error('✗ Embedding Manager initialization failed:', embeddingError);
      embeddingManager = null; // Clear it so status checks work correctly
      throw embeddingError;
    }

    console.log('Ollama, Gemma 3, and Embedding initialized successfully');

    if (mainWindow) {
      mainWindow.webContents.send('llm:ready');
    }
  } catch (error: any) {
    console.error('Failed to initialize Ollama:', error);
    if (mainWindow) {
      mainWindow.webContents.send('llm:error', {
        message: 'Failed to start Ollama server',
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
    if (!ollamaManager) throw new Error('LLM not initialized');
    return await ollamaManager.chat(message, options);
  });

  // Streaming chat handler
  ipcMain.handle('llm:stream-start', async (_event, message: string, options?: any) => {
    if (!ollamaManager) throw new Error('LLM not initialized');

    const sessionId = options?.sessionId || 'default';
    const streamId = options?.streamId || 'default';

    // Convert videos/images from IPC-serialized format to base64 strings
    let images: string[] | undefined = undefined;
    if (options?.videos && Array.isArray(options.videos)) {
      const convertedImages = options.videos.map((video: any) => {
        let buffer: Buffer;
        if (video?.data && video?.type === 'Buffer') {
          buffer = Buffer.from(video.data);
        } else if (ArrayBuffer.isView(video)) {
          buffer = Buffer.from(video.buffer, video.byteOffset, video.byteLength);
        } else if (video instanceof ArrayBuffer) {
          buffer = Buffer.from(video);
        } else {
          return null;
        }
        // Convert to base64 for Ollama
        return buffer.toString('base64');
      }).filter((img: string | null): img is string => img !== null);

      images = convertedImages;
      console.log(`[IPC] Converted ${convertedImages.length} image(s) to base64 for Ollama`);
    }

    await ollamaManager.streamChat(message, {
      ...options,
      images, // Pass base64 encoded images
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
    if (!ollamaManager) throw new Error('LLM not initialized');
    return await ollamaManager.createSession(systemPrompt);
  });

  ipcMain.handle('llm:clear-session', async (_event, sessionId: string) => {
    if (!ollamaManager) throw new Error('LLM not initialized');
    await ollamaManager.clearSession(sessionId);
  });

  // Model info
  ipcMain.handle('llm:model-info', async () => {
    if (!ollamaManager) throw new Error('LLM not initialized');
    return ollamaManager.getModelInfo();
  });

  // Model download handler (for download-on-first-run)
  ipcMain.handle('model:start-download', async (_event) => {
    if (!mainWindow) throw new Error('No window found');

    try {
      const downloadTasks = [];

      // Check if Ollama needs to be initialized
      if (!electronOllama) {
        electronOllama = new ElectronOllama({
          basePath: app.getPath('userData')
        });
      }

      // Check if Ollama server is running
      const isRunning = await electronOllama.isRunning();
      if (!isRunning) {
        console.log('Downloading and starting Ollama server...');
        mainWindow.webContents.send('model:download-progress', {
          modelName: 'Ollama Server',
          percent: 0,
          transferred: 0,
          total: 25_000_000 // ~25MB actual size
        });

        let versionToDownload: `v${number}.${number}.${number}` | null = null;

        try {
          // Try to get metadata for latest version
          const metadata = await electronOllama.getMetadata('latest');
          console.log(`Latest Ollama version: ${metadata.version}`);
          versionToDownload = metadata.version;
        } catch (metadataError: any) {
          // If GitHub API fails, check for local version
          console.warn('Failed to fetch Ollama metadata from GitHub:', metadataError.message);
          console.log('Checking for locally installed Ollama version...');

          const ollamaBasePath = path.join(app.getPath('userData'), 'ollama');
          const { readdir } = await import('node:fs/promises');

          if (existsSync(ollamaBasePath)) {
            const versions = await readdir(ollamaBasePath);
            if (versions.length > 0) {
              versionToDownload = versions[0] as `v${number}.${number}.${number}`;
              console.log(`Using locally installed version: ${versionToDownload}`);
            }
          }

          if (!versionToDownload) {
            throw new Error('Cannot download Ollama: GitHub API unavailable and no local installation found. Please check your internet connection.');
          }
        }

        // Check if binary is downloaded
        const isDownloaded = await electronOllama.isDownloaded(versionToDownload);

        if (!isDownloaded) {
          console.log(`Downloading Ollama ${versionToDownload}...`);
          await electronOllama.download(versionToDownload, undefined, {
            log: (percent, msg) => {
              console.log(`[Ollama Download] ${percent}%: ${msg}`);
              mainWindow?.webContents.send('model:download-progress', {
                modelName: 'Ollama Server',
                percent: percent / 100,
                transferred: Math.floor((percent / 100) * 25_000_000),
                total: 25_000_000
              });
            }
          });
        }

        // Set execute permissions
        const binPath = electronOllama.getBinPath(versionToDownload);
        const ollamaBinary = path.join(binPath, electronOllama.getExecutableName(electronOllama.currentPlatformConfig()));

        if (existsSync(ollamaBinary)) {
          const { exec } = await import('child_process');
          await new Promise<void>((resolve, reject) => {
            exec(`chmod +x "${ollamaBinary}"`, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
          console.log('Execute permissions set on Ollama binary');
        }

        // Start server
        await electronOllama.serve(versionToDownload, {
          serverLog: (msg) => console.log('[Ollama Server]', msg)
        });
        console.log('Ollama server started');
      }

      // Initialize Ollama Manager if needed
      if (!ollamaManager) {
        ollamaManager = new OllamaManager();
        await ollamaManager.initialize();
      }

      // Check if Gemma 3 model needs to be pulled
      const hasModel = await ollamaManager.isModelAvailable();
      if (!hasModel) {
        downloadTasks.push({
          type: 'llm',
          name: 'Gemma 3 4B (Multimodal)',
          needsPull: true
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
        await initializeOllama();
        mainWindow.webContents.send('model:download-complete');
        return { success: true };
      }

      console.log(`Need to download ${downloadTasks.length} model(s)`);

      // Download models
      for (const task of downloadTasks) {
        if (task.type === 'llm' && task.needsPull) {
          // Download Gemma 3 via Ollama
          console.log(`\n=== Pulling ${task.name} ===`);

          await ollamaManager!.pullModel((percent, status) => {
            mainWindow?.webContents.send('model:download-progress', {
              modelName: task.name,
              percent: percent / 100,
              transferred: Math.floor((percent / 100) * 4_435_402_752),
              total: 4_435_402_752 // ~4.13 GB
            });
            console.log(`  [${percent.toFixed(1)}%] ${status}`);
          });

          console.log(`✓ ${task.name} complete\n`);
        } else if (task.files) {
          // Download embedding models (DRAGON encoders)
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
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('=== All models downloaded successfully ===\n');

      await initializeOllama();

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
    // Check if Ollama model is available
    let llmDownloaded = false;
    try {
      if (ollamaManager) {
        llmDownloaded = await ollamaManager.isModelAvailable();
      }
    } catch (error) {
      console.error('Error checking Ollama model:', error);
    }

    const chatQueryEncoderDownloaded = isEmbeddingModelDownloaded(CHAT_QUERY_ENCODER_INFO);
    const chatKeyEncoderDownloaded = isEmbeddingModelDownloaded(CHAT_KEY_ENCODER_INFO);

    return {
      models: {
        llm: {
          name: 'Gemma 3 4B (Multimodal)',
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
      initialized: ollamaManager !== null && embeddingManager !== null && embeddingManager.isReady()
    };
  });

  // Embedding handlers
  ipcMain.handle('embedding:query', async (_event, text: string) => {
    if (!embeddingManager || !embeddingManager.isReady()) {
      throw new Error('Embedding manager not initialized');
    }
    return await embeddingManager.embedQuery(text);
  });

  ipcMain.handle('embedding:context', async (_event, text: string) => {
    if (!embeddingManager || !embeddingManager.isReady()) {
      throw new Error('Embedding manager not initialized');
    }
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

  // Check if embedding models are downloaded
  const embeddingsReady = isEmbeddingModelDownloaded(CHAT_QUERY_ENCODER_INFO) &&
                          isEmbeddingModelDownloaded(CHAT_KEY_ENCODER_INFO);

  // Try to initialize or start Ollama
  try {
    electronOllama = new ElectronOllama({
      basePath: app.getPath('userData')
    });

    let ollamaRunning = await electronOllama.isRunning();
    let hasOllamaModel = false;

    // If Ollama not running but models exist, try to start it
    if (!ollamaRunning && embeddingsReady) {
      console.log('Models exist but Ollama not running. Attempting to start Ollama server...');

      try {
        // Try to get metadata with timeout handling
        const metadata = await electronOllama.getMetadata('latest');
        const isDownloaded = await electronOllama.isDownloaded(metadata.version);

        if (isDownloaded) {
          await electronOllama.serve(metadata.version, {
            serverLog: (msg) => console.log('[Ollama Server]', msg)
          });
          ollamaRunning = true;
          console.log('Ollama server started successfully');
        }
      } catch (metadataError: any) {
        // If GitHub API fails, try to start with manually detected local version
        console.warn('Failed to fetch Ollama metadata from GitHub:', metadataError.message);
        console.log('Trying to start Ollama with locally installed version...');

        try {
          // Look for locally installed Ollama binaries
          const ollamaBasePath = path.join(app.getPath('userData'), 'ollama');
          const { readdir } = await import('node:fs/promises');

          if (existsSync(ollamaBasePath)) {
            const versions = await readdir(ollamaBasePath);

            if (versions.length > 0) {
              // Use the first available version (cast to proper type)
              const localVersion = versions[0] as `v${number}.${number}.${number}`;
              console.log(`Found local Ollama version: ${localVersion}`);

              await electronOllama.serve(localVersion, {
                serverLog: (msg) => console.log('[Ollama Server]', msg)
              });
              ollamaRunning = true;
              console.log('Ollama server started successfully with local version');
            } else {
              console.log('No local Ollama versions found');
            }
          } else {
            console.log('Ollama base path does not exist');
          }
        } catch (localStartError: any) {
          console.error('Failed to start Ollama with local version:', localStartError.message);
        }
      }
    }

    // Check if Ollama model is available
    if (ollamaRunning) {
      try {
        const tempOllamaManager = new OllamaManager();
        await tempOllamaManager.initialize();
        hasOllamaModel = await tempOllamaManager.isModelAvailable();
        await tempOllamaManager.cleanup();
      } catch (error) {
        console.error('Failed to check Ollama model:', error);
      }
    }

    // If all models exist, initialize everything
    if (embeddingsReady && ollamaRunning && hasOllamaModel) {
      console.log('All models ready, initializing...');
      try {
        await initializeOllama();
      } catch (error) {
        console.error('Ollama initialization failed:', error);
      }
    } else {
      console.log('Models not ready. User will need to download them.');
      console.log(`  Embeddings ready: ${embeddingsReady}`);
      console.log(`  Ollama running: ${ollamaRunning}`);
      console.log(`  Ollama model available: ${hasOllamaModel}`);

      // Only show download dialog if models are actually missing, not on network errors
      const shouldShowDialog = !embeddingsReady || !hasOllamaModel;
      if (mainWindow && shouldShowDialog) {
        // Delay sending model-not-found to allow frontend to complete initial check
        // This prevents dialog from flashing during startup
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('llm:model-not-found');
          }
        }, 1500);
      }
    }
  } catch (error) {
    console.error('Failed to check/start Ollama:', error);
    // Don't show download dialog on general errors - user might just need to retry
    console.warn('Skipping download dialog due to initialization error');
  }
});

// Cleanup on app quit
app.on('before-quit', async () => {
  if (ollamaManager) {
    console.log('Cleaning up Ollama Manager...');
    await ollamaManager.cleanup();
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
