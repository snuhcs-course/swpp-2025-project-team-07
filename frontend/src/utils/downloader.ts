import { BrowserWindow, app } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';

export interface DownloadOptions {
  downloadUrl: string;
  targetFileName: string;
  targetDirectory: string;
  modelName: string;
  expectedSize?: number;
  onProgress?: (progress: number) => void;
}

function downloadWithRedirects(
  url: string,
  savePath: string,
  onProgress: (transferred: number, total: number) => void,
  maxRedirects = 5
): Promise<void> {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;

    const doDownload = (downloadUrl: string) => {
      const protocol = downloadUrl.startsWith('https') ? https : http;
      
      const request = protocol.get(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {
          let redirectUrl = response.headers.location;
          
          if (!redirectUrl) {
            reject(new Error('Redirect location not provided'));
            return;
          }

          if (redirectUrl.startsWith('/')) {
            const urlObj = new URL(downloadUrl);
            redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
          } else if (!redirectUrl.startsWith('http')) {
            const urlObj = new URL(downloadUrl);
            redirectUrl = new URL(redirectUrl, `${urlObj.protocol}//${urlObj.host}`).href;
          }

          redirectCount++;
          if (redirectCount > maxRedirects) {
            reject(new Error('Too many redirects'));
            return;
          }

          console.log(`Following redirect (${redirectCount}/${maxRedirects}): ${redirectUrl}`);
          response.resume();
          doDownload(redirectUrl);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        console.log(`Starting download: ${totalBytes} bytes (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);

        const fileStream = fs.createWriteStream(savePath);
        
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          onProgress(downloadedBytes, totalBytes);
        });

        response.on('end', () => {
          fileStream.end();
        });

        fileStream.on('finish', () => {
          console.log('File write complete');
          resolve();
        });

        fileStream.on('error', (err) => {
          fileStream.close();
          fs.unlink(savePath, () => {});
          reject(err);
        });

        response.pipe(fileStream);
      });

      request.on('error', (err) => {
        reject(err);
      });

      request.setTimeout(60000, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    };

    doDownload(url);
  });
}

export async function downloadFile(
  mainWindow: BrowserWindow,
  options: DownloadOptions
): Promise<string> {
  const saveDir = path.join(app.getPath('userData'), options.targetDirectory);
  const savePath = path.join(saveDir, options.targetFileName);

  if (fs.existsSync(savePath)) {
    console.log('File already exists:', savePath);
    
    if (options.expectedSize) {
      const stats = fs.statSync(savePath);
      const tolerance = 1024 * 1024; // 1MB
      
      if (Math.abs(stats.size - options.expectedSize) > tolerance) {
        console.log('Existing file size mismatch, re-downloading...');
        fs.unlinkSync(savePath);
      } else {
        console.log('File size verified, skipping download');
        return savePath;
      }
    } else {
      return savePath;
    }
  }

  const fileDir = path.dirname(savePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  try {
    console.log(`Starting download for: ${options.modelName}`);
    console.log(`URL: ${options.downloadUrl}`);
    console.log(`Save path: ${savePath}`);

    let lastPercent = 0;

    await downloadWithRedirects(
      options.downloadUrl,
      savePath,
      (transferred, total) => {
        const percent = total > 0 ? transferred / total : 0;
        
        if (Math.floor(percent * 100) >= lastPercent + 10 || percent === 1) {
          lastPercent = Math.floor(percent * 100);
          console.log(
            `${options.modelName}: ${Math.floor(percent * 100)}% ` +
            `(${Math.floor(transferred / 1024 / 1024)}MB / ${Math.floor(total / 1024 / 1024)}MB)`
          );
        }

        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('model:download-progress', {
            modelName: options.modelName,
            percent,
            transferred,
            total
          });
        }

        if (options.onProgress) {
          options.onProgress(percent);
        }
      }
    );

    console.log('Download complete:', savePath);

    if (!fs.existsSync(savePath)) {
      throw new Error('Downloaded file not found');
    }

    const stats = fs.statSync(savePath);
    console.log(`File downloaded: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

    if (options.expectedSize) {
      const tolerance = 1024 * 1024; // 1MB
      
      if (Math.abs(stats.size - options.expectedSize) > tolerance) {
        console.error(`Size mismatch: expected ${options.expectedSize}, got ${stats.size}`);
        fs.unlinkSync(savePath);
        throw new Error(
          `Download incomplete. File size mismatch: ` +
          `expected ${(options.expectedSize / 1024 / 1024).toFixed(2)}MB, ` +
          `got ${(stats.size / 1024 / 1024).toFixed(2)}MB`
        );
      }
      console.log(`✓ File size verified: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }

    return savePath;
    
  } catch (error: any) {
    console.error('Download failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      modelName: options.modelName,
      url: options.downloadUrl
    });
    
    if (fs.existsSync(savePath)) {
      try {
        console.log('Cleaning up partial download...');
        fs.unlinkSync(savePath);
      } catch (cleanupError) {
        console.error('Failed to clean up partial download:', cleanupError);
      }
    }
    
    throw new Error(`Failed to download ${options.modelName}: ${error.message}`);
  }
}