import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia (used by many UI components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Electron APIs for renderer process tests
global.window = Object.assign(global.window, {
  llmAPI: {
    chat: vi.fn(),
    streamChat: vi.fn(),
    onStreamChunk: vi.fn(),
    offStreamChunk: vi.fn(),
    createSession: vi.fn(),
    clearSession: vi.fn(),
    getModelInfo: vi.fn(),
  },
  modelAPI: {
    checkDownloaded: vi.fn(),
    startDownload: vi.fn(),
    onDownloadProgress: vi.fn(),
    offDownloadProgress: vi.fn(),
    onDownloadComplete: vi.fn(),
    offDownloadComplete: vi.fn(),
    onDownloadError: vi.fn(),
    offDownloadError: vi.fn(),
  },
  embeddingAPI: {
    embedQuery: vi.fn(),
    embedContext: vi.fn(),
    isReady: vi.fn(),
  },
  recorderAPI: {
    listSources: vi.fn(),
    chooseSource: vi.fn(),
    saveFile: vi.fn(),
  },
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});
