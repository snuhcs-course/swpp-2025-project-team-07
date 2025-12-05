import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';

type ResponseConfig = {
  statusCode?: number;
  statusMessage?: string;
  headers?: Record<string, string>;
  bodySize?: number;
  fileStreamError?: Error;
  error?: Error;
};

const {
  files,
  directories,
  existsSync,
  statSync,
  mkdirSync,
  unlinkSync,
  unlink,
  createWriteStream,
  appGetPathMock,
  httpsGetMock,
  httpGetMock,
} = vi.hoisted(() => {
  const files = new Map<string, number>();
  const directories = new Set<string>();

  return {
    files,
    directories,
    existsSync: vi.fn((target: string) => files.has(target) || directories.has(target)),
    statSync: vi.fn((target: string) => ({ size: files.get(target) ?? 0 })),
    mkdirSync: vi.fn((target: string) => {
      directories.add(target);
    }),
    unlinkSync: vi.fn((target: string) => {
      files.delete(target);
    }),
    unlink: vi.fn((target: string, cb?: (err?: Error | null) => void) => {
      files.delete(target);
      if (cb) cb(null);
    }),
    createWriteStream: vi.fn(),
    appGetPathMock: vi.fn(),
    httpsGetMock: vi.fn(),
    httpGetMock: vi.fn(),
  };
});

class MockWriteStream extends EventEmitter {
  private bytesWritten = 0;

  constructor(private targetPath: string) {
    super();
  }

  write(chunk: Buffer) {
    this.bytesWritten += chunk.length;
    files.set(this.targetPath, this.bytesWritten);
    return true;
  }

  end() {
    files.set(this.targetPath, this.bytesWritten);
    this.emit('finish');
  }

  close() {
    this.emit('close');
  }
}

vi.mock('fs', () => {
  const fsMock = {
    existsSync,
    statSync,
    mkdirSync,
    unlinkSync,
    unlink,
    createWriteStream,
  };

  return {
    ...fsMock,
    default: fsMock,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: {
    getPath: appGetPathMock,
  },
}));

vi.mock('https', () => ({
  get: httpsGetMock,
  default: { get: httpsGetMock },
}));
vi.mock('http', () => ({
  get: httpGetMock,
  default: { get: httpGetMock },
}));

import { downloadFile } from './downloader';
import type { DownloadOptions } from './downloader';
import { app } from 'electron';

const USER_DATA_PATH = path.join(process.cwd(), 'mock-user-data');

function mockRequestSequence(mockFn: ReturnType<typeof vi.fn>, responses: ResponseConfig[]) {
  let callIndex = 0;

  mockFn.mockImplementation((_url: string, _options: unknown, callback: (response: any) => void) => {
    const config = responses[Math.min(callIndex, responses.length - 1)];
    callIndex += 1;

    const request = new EventEmitter() as any;
    request.setTimeout = vi.fn();
    request.destroy = vi.fn();
    request.on = EventEmitter.prototype.on;

    if (config.error) {
      process.nextTick(() => {
        request.emit('error', config.error);
      });
      return request;
    }

    const response = new EventEmitter() as any;
    response.statusCode = config.statusCode ?? 200;
    response.statusMessage = config.statusMessage ?? 'OK';
    response.headers = config.headers ?? {};
    response.resume = vi.fn();
    let pipedStream: any;
    response.pipe = (dest: any) => {
      response.on('data', (chunk: Buffer) => dest.write?.(chunk));
      response.on('end', () => dest.end?.());
      pipedStream = dest;
      return dest;
    };

    process.nextTick(() => {
      callback(response);
      if (config.bodySize && config.bodySize > 0) {
        const chunk = Buffer.alloc(config.bodySize, 1);
        response.emit('data', chunk);
      }
      if (config.fileStreamError && pipedStream) {
        pipedStream.emit('error', config.fileStreamError);
      }
      response.emit('end');
    });

    return request;
  });
}

function setupSuccessfulHttpsDownload(totalBytes = 2048) {
  mockRequestSequence(httpsGetMock, [
    {
      statusCode: 200,
      headers: { 'content-length': String(totalBytes) },
      bodySize: totalBytes,
    },
  ]);
}

describe('downloadFile', () => {
  beforeEach(() => {
    files.clear();
    directories.clear();
    vi.clearAllMocks();
    createWriteStream.mockImplementation((target: string) => new MockWriteStream(target));
    unlink.mockImplementation((target: string, cb?: (err?: Error | null) => void) => {
      files.delete(target);
      if (cb) cb(null);
    });
    appGetPathMock.mockReset();
    appGetPathMock.mockReturnValue(USER_DATA_PATH);
    httpsGetMock.mockReset();
    httpGetMock.mockReset();
  });

  it('returns existing file when size matches expected value', async () => {
    const options: DownloadOptions = {
      downloadUrl: 'https://example.com/model.bin',
      targetFileName: 'model.bin',
      targetDirectory: 'models',
      modelName: 'ExistingModel',
      expectedSize: 1024,
    };
    const saveDir = path.join(USER_DATA_PATH, options.targetDirectory);
    const savePath = path.join(saveDir, options.targetFileName);
    directories.add(saveDir);
    files.set(savePath, options.expectedSize);

    const result = await downloadFile({ webContents: { send: vi.fn() } } as any, options);

    expect(result).toBe(savePath);
    expect(httpsGetMock).not.toHaveBeenCalled();
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('downloads file, reports progress, and verifies size', async () => {
    const onProgress = vi.fn();
    const options: DownloadOptions = {
      downloadUrl: 'https://example.com/model.bin',
      targetFileName: 'model.bin',
      targetDirectory: 'models',
      modelName: 'TestModel',
      expectedSize: 2048,
      onProgress,
    };
    const saveDir = path.join(USER_DATA_PATH, options.targetDirectory);
    const savePath = path.join(saveDir, options.targetFileName);
    setupSuccessfulHttpsDownload(options.expectedSize);

    const mainWindow = {
      webContents: {
        send: vi.fn(),
      },
    } as any;

    const returnedPath = await downloadFile(mainWindow, options);

    expect(returnedPath).toBe(savePath);
    expect(directories.has(saveDir)).toBe(true);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('model:download-progress', expect.objectContaining({
      modelName: 'TestModel',
    }));
    expect(onProgress).toHaveBeenCalledWith(1);
    expect(files.get(savePath)).toBe(options.expectedSize);
    expect(statSync).toHaveBeenCalledWith(savePath);
  });

  it('removes stale files when size mismatches before re-downloading', async () => {
    const options: DownloadOptions = {
      downloadUrl: 'https://example.com/model.bin',
      targetFileName: 'model.bin',
      targetDirectory: 'models',
      modelName: 'StaleModel',
      expectedSize: 1024,
    };
    const saveDir = path.join(USER_DATA_PATH, options.targetDirectory);
    const savePath = path.join(saveDir, options.targetFileName);
    directories.add(saveDir);
    files.set(savePath, options.expectedSize + 5 * 1024 * 1024); // ensure mismatch
    setupSuccessfulHttpsDownload(options.expectedSize);

    const mainWindow = { webContents: { send: vi.fn() } } as any;
    const returnedPath = await downloadFile(mainWindow, options);

    expect(unlinkSync).toHaveBeenCalledWith(savePath);
    expect(returnedPath).toBe(savePath);
    expect(files.get(savePath)).toBe(options.expectedSize);
    expect(httpsGetMock).toHaveBeenCalledTimes(1);
  });

  it('follows redirects including relative targets before downloading', async () => {
    const options: DownloadOptions = {
      downloadUrl: 'https://example.com/start',
      targetFileName: 'model.bin',
      targetDirectory: 'models',
      modelName: 'RedirectedModel',
      expectedSize: 1024,
    };
    const savePath = path.join(USER_DATA_PATH, options.targetDirectory, options.targetFileName);

    mockRequestSequence(httpsGetMock, [
      {
        statusCode: 302,
        headers: { location: '/download/model.bin' },
      },
      {
        statusCode: 200,
        headers: { 'content-length': String(options.expectedSize) },
        bodySize: options.expectedSize,
      },
    ]);

    const result = await downloadFile({ webContents: { send: vi.fn() } } as any, options);

    expect(httpsGetMock).toHaveBeenCalledTimes(2);
    expect(result).toBe(savePath);
    expect(files.get(savePath)).toBe(options.expectedSize);
  });

  it('uses http protocol when URL starts with http://', async () => {
    const options: DownloadOptions = {
      downloadUrl: 'http://example.com/model.bin',
      targetFileName: 'model.bin',
      targetDirectory: 'models',
      modelName: 'HttpModel',
    };
    const savePath = path.join(USER_DATA_PATH, options.targetDirectory, options.targetFileName);

    mockRequestSequence(httpGetMock, [
      {
        statusCode: 200,
        headers: { 'content-length': '512' },
        bodySize: 512,
      },
    ]);

    const result = await downloadFile({ webContents: { send: vi.fn() } } as any, options);

    expect(httpGetMock).toHaveBeenCalledTimes(1);
    expect(httpsGetMock).not.toHaveBeenCalled();
    expect(result).toBe(savePath);
    expect(files.get(savePath)).toBe(512);
  });

  it('cleans up file and throws when size verification fails after download', async () => {
    const options: DownloadOptions = {
      downloadUrl: 'https://example.com/large.bin',
      targetFileName: 'large.bin',
      targetDirectory: 'models',
      modelName: 'LargeModel',
      expectedSize: 6 * 1024 * 1024,
    };
    const savePath = path.join(USER_DATA_PATH, options.targetDirectory, options.targetFileName);

    mockRequestSequence(httpsGetMock, [
      {
        statusCode: 200,
        headers: { 'content-length': String(2 * 1024 * 1024) },
        bodySize: 2 * 1024 * 1024,
      },
    ]);

    await expect(downloadFile({ webContents: { send: vi.fn() } } as any, options)).rejects.toThrow(
      /Download incomplete\. File size mismatch/,
    );

    expect(unlinkSync).toHaveBeenCalledWith(savePath);
    expect(files.has(savePath)).toBe(false);
  });

  it('cleans up partial files when request emits an error', async () => {
    const options: DownloadOptions = {
      downloadUrl: 'https://example.com/fail.bin',
      targetFileName: 'fail.bin',
      targetDirectory: 'models',
      modelName: 'FailModel',
    };
    const saveDir = path.join(USER_DATA_PATH, options.targetDirectory);
    const savePath = path.join(saveDir, options.targetFileName);
    directories.add(saveDir);
    unlink.mockImplementation((_target: string, cb?: (err?: Error | null) => void) => {
      if (cb) cb(null);
    });

    mockRequestSequence(httpsGetMock, [
      {
        statusCode: 200,
        headers: { 'content-length': '1024' },
        bodySize: 1024,
        fileStreamError: new Error('disk full'),
      },
    ]);

    await expect(downloadFile({ webContents: { send: vi.fn() } } as any, options)).rejects.toThrow(
      'Failed to download FailModel: disk full',
    );

    expect(files.has(savePath)).toBe(false);
    expect(unlinkSync).toHaveBeenCalledWith(savePath);
  });
});
