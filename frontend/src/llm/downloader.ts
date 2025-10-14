import { BrowserWindow, app } from 'electron';
import { download } from 'electron-dl';
import path from 'path';
import fs from 'fs';

export interface ModelDownloadOptions {
  modelName: string;
  modelUrl: string;
  modelFileName: string;
  onProgress?: (progress: number) => void;
}

export async function downloadModel(
  mainWindow: BrowserWindow,
  options: ModelDownloadOptions
): Promise<string> {
  const modelDir = path.join(app.getPath('userData'), 'models');
  const modelPath = path.join(modelDir, options.modelFileName);

  // Check if already downloaded
  if (fs.existsSync(modelPath)) {
    console.log('Model already exists:', modelPath);
    return modelPath;
  }

  // Create models directory
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  try {
    console.log('Starting model download from:', options.modelUrl);

    // Download with progress tracking
    await download(mainWindow, options.modelUrl, {
      directory: modelDir,
      filename: options.modelFileName,
      onProgress: (progress) => {
        const percent = progress.percent;
        if (options.onProgress) {
          options.onProgress(percent);
        }
        mainWindow.webContents.send('model:download-progress', {
          percent,
          transferred: progress.transferredBytes,
          total: progress.totalBytes
        });
      }
    });

    console.log('Model download complete:', modelPath);

    // Verify the downloaded file size
    if (fs.existsSync(modelPath)) {
      const stats = fs.statSync(modelPath);
      const expectedSize = 6_909_282_656; // Q4_0 model size
      const tolerance = 1024 * 1024; // 1MB tolerance

      if (Math.abs(stats.size - expectedSize) > tolerance) {
        console.error(`Downloaded file size (${stats.size}) doesn't match expected size (${expectedSize})`);
        // Clean up incomplete download
        fs.unlinkSync(modelPath);
        throw new Error('Download incomplete or corrupted. File size mismatch.');
      }

      console.log(`File size verified: ${stats.size} bytes`);
    }

    return modelPath;
  } catch (error: any) {
    console.error('Model download failed:', error);

    // Clean up partial download if it exists
    if (fs.existsSync(modelPath)) {
      try {
        console.log('Cleaning up partial download...');
        fs.unlinkSync(modelPath);
      } catch (cleanupError) {
        console.error('Failed to clean up partial download:', cleanupError);
      }
    }

    throw new Error(`Failed to download model: ${error.message}`);
  }
}

export function getModelPath(): string {
  // For development: check local models directory first
  const devModelPath = path.join(process.cwd(), 'models', 'gemma-3-12b-it-Q4_0.gguf');
  if (fs.existsSync(devModelPath)) {
    return devModelPath;
  }

  // For production: use userData directory
  return path.join(
    app.getPath('userData'),
    'models',
    'gemma-3-12b-it-Q4_0.gguf'
  );
}

export function isModelDownloaded(): boolean {
  return fs.existsSync(getModelPath());
}
