import { BrowserWindow, app } from 'electron';
import { download } from 'electron-dl';
import path from 'path';
import fs from 'fs';

export interface DownloadOptions {
  downloadUrl: string;
  targetFileName: string;
  targetDirectory: string; // 예: 'models' 또는 'embeddings'
  expectedSize?: number; // 선택 사항으로 변경
  onProgress?: (progress: number) => void;
}

export async function downloadFile(
  mainWindow: BrowserWindow,
  options: DownloadOptions
): Promise<string> {
  const saveDir = path.join(app.getPath('userData'), options.targetDirectory);
  const savePath = path.join(saveDir, options.targetFileName);

  if (fs.existsSync(savePath)) {
    console.log('File already exists:', savePath);
    return savePath;
  }

  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  try {
    console.log('Starting download from:', options.downloadUrl);

    await download(mainWindow, options.downloadUrl, {
      directory: saveDir,
      filename: options.targetFileName,
      onProgress: (progress) => {
        const percent = progress.percent;

        // 1. UI(React)에 진행률 전송 (필수)
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('model:download-progress', {
            percent,
            transferred: progress.transferredBytes,
            total: progress.totalBytes
          });
        }

        // 2. (선택 사항) 옵션으로 전달받은 콜백 실행
        if (options.onProgress) {
          options.onProgress(percent);
        }
     }
    });

    console.log('Download complete:', savePath);

    // ... (파일 크기 검증 로직)
   if (options.expectedSize) {
      if (fs.existsSync(savePath)) {
        const stats = fs.statSync(savePath);
        const tolerance = 1024 * 1024; // 1MB

        if (Math.abs(stats.size - options.expectedSize) > tolerance) {
          fs.unlinkSync(savePath);
          throw new Error('Download incomplete. File size mismatch.');
        }
        console.log(`File size verified: ${stats.size} bytes`);
      }
    }

    return savePath;
  } catch (error: any) {
    console.error('Download failed:', error);
    // ... (실패 시 파일 정리 로직)
    if (fs.existsSync(savePath)) {
      try {
        fs.unlinkSync(savePath);
      } catch (cleanupError) {
        console.error('Failed to clean up partial download:', cleanupError);
      }
    }
    throw new Error(`Failed to download file: ${error.message}`);
  }
}

// getModelPath() 와 isModelDownloaded() 는 여기서 제거!