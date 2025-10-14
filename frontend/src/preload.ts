// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { LLMChatOptions, LLMStreamChunk, LLMModelInfo, ModelDownloadProgress } from './types/electron';

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

async function startRecording() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp9",
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const buf = Buffer.from(await blob.arrayBuffer());
    await ipcRenderer.invoke("rec:save-file", buf);
  };

  mediaRecorder.start();
}

async function stopRecording() {
  mediaRecorder?.stop();
  mediaRecorder = null;
}

contextBridge.exposeInMainWorld("recorder", {
  listSources: () => ipcRenderer.invoke("rec:list-sources"),
  chooseSource: (id: string) => ipcRenderer.invoke("rec:choose-source", id),
  start: () => startRecording(),
  stop: () => stopRecording(),
});


// Expose LLM API to renderer process
contextBridge.exposeInMainWorld('llmAPI', {
  // Chat methods
  chat: (message: string, options?: LLMChatOptions): Promise<string> =>
    ipcRenderer.invoke('llm:chat', message, options),

  streamChat: (message: string, options?: LLMChatOptions): Promise<void> =>
    ipcRenderer.invoke('llm:stream-start', message, options),

  // Session management
  createSession: (systemPrompt?: string): Promise<string> =>
    ipcRenderer.invoke('llm:create-session', systemPrompt),

  clearSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('llm:clear-session', sessionId),

  // Model info
  getModelInfo: (): Promise<LLMModelInfo> =>
    ipcRenderer.invoke('llm:model-info'),

  // Event listeners for streaming
  onStreamChunk: (callback: (chunk: LLMStreamChunk) => void): void => {
    const listener = (_event: IpcRendererEvent, chunk: LLMStreamChunk) => callback(chunk);
    ipcRenderer.on('llm:stream-chunk', listener);
  },

  onStreamEnd: (callback: (sessionId: string) => void): void => {
    const listener = (_event: IpcRendererEvent, sessionId: string) => callback(sessionId);
    ipcRenderer.on('llm:stream-end', listener);
  },

  offStreamChunk: (callback: (chunk: LLMStreamChunk) => void): void => {
    ipcRenderer.removeListener('llm:stream-chunk', callback as any);
  },

  offStreamEnd: (callback: (sessionId: string) => void): void => {
    ipcRenderer.removeListener('llm:stream-end', callback as any);
  },

  // Model download methods (for download-on-first-run strategy)
  checkModelDownloaded: () =>
    ipcRenderer.invoke('model:check-downloaded'),

  startModelDownload: () =>
    ipcRenderer.invoke('model:start-download'),

  onDownloadProgress: (callback: (progress: ModelDownloadProgress) => void): void => {
    const listener = (_event: IpcRendererEvent, progress: ModelDownloadProgress) => callback(progress);
    ipcRenderer.on('model:download-progress', listener);
  },

  onDownloadComplete: (callback: () => void): void => {
    const listener = () => callback();
    ipcRenderer.on('model:download-complete', listener);
  },

  onDownloadError: (callback: (error: string) => void): void => {
    const listener = (_event: IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('model:download-error', listener);
  },

  onModelNotFound: (callback: () => void): void => {
    const listener = () => callback();
    ipcRenderer.on('llm:model-not-found', listener);
  },

  onLLMReady: (callback: () => void): void => {
    const listener = () => callback();
    ipcRenderer.on('llm:ready', listener);
  },

  onLLMError: (callback: (error: {message: string; error: string}) => void): void => {
    const listener = (_event: IpcRendererEvent, error: {message: string; error: string}) => callback(error);
    ipcRenderer.on('llm:error', listener);
  }
});
