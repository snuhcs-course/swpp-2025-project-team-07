export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMModelInfo {
  name: string;
  size: number;
  quantization: string;
  contextSize: number;
  loaded: boolean;
}

export interface LLMStreamChunk {
  sessionId: string;
  streamId: string;
  chunk: string;
  done: boolean;
}

export interface LLMChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
  sessionId?: string;
  streamId?: string;
  /**
   * Video data for multimodal input (Gemma 3 via Ollama)
   * - Videos are automatically converted to image frames at 1 fps using FFmpeg
   * - Each video is processed to extract keyframes which are passed to the LLM
   * - ArrayBuffers for IPC compatibility
   * - Maximum 30 frames total to stay within context window
   */
  videos?: ArrayBuffer[];
}

export interface ModelDownloadProgress {
  modelName: string;
  percent: number;
  transferred: number;
  total: number;
}

export interface ModelStatus {
  downloaded: boolean;
  initialized: boolean;
  path: string;
}

export interface EmbeddingAPI {
  embedQuery: (text: string) => Promise<number[]>;
  embedContext: (text: string) => Promise<number[]>;
  isReady: () => Promise<boolean>;
}

declare global {
  interface Window {
    llmAPI: {
      // Chat methods
      chat: (message: string, options?: LLMChatOptions) => Promise<string>;
      streamChat: (
        message: string,
        options?: LLMChatOptions
      ) => Promise<void>;

      // Session management
      createSession: (systemPrompt?: string) => Promise<string>;
      clearSession: (sessionId: string) => Promise<void>;

      // Model info
      getModelInfo: () => Promise<LLMModelInfo>;

      // Event listeners for streaming
      onStreamChunk: (callback: (chunk: LLMStreamChunk) => void) => void;
      onStreamEnd: (callback: (sessionId: string) => void) => void;
      offStreamChunk: (callback: (chunk: LLMStreamChunk) => void) => void;
      offStreamEnd: (callback: (sessionId: string) => void) => void;

      // Model download methods (for download-on-first-run)
      checkModelDownloaded: () => Promise<ModelStatus>;
      startModelDownload: () => Promise<{success: boolean; path?: string; error?: string}>;
      onDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => void;
      onDownloadComplete: (callback: () => void) => void;
      onDownloadError: (callback: (error: string) => void) => void;
      onModelNotFound: (callback: () => void) => void;
      onLLMReady: (callback: () => void) => void;
      onLLMError: (callback: (error: {message: string; error: string}) => void) => void;
    };
    embeddingAPI: EmbeddingAPI;
  }
}

declare global {
  interface Window {
    vembedAPI: {
      isModelReady(): Promise<boolean>;
      startModelDownload(): Promise<{ success: boolean; error?: string }>;
      onDownloadProgress(cb: (p: ModelDownloadProgress) => void): void;
      onDownloadComplete(cb: () => void): void;
      onDownloadError(cb: (msg: string) => void): void;
      getModelBytes(): Promise<ArrayBuffer>;
    };
  }
}

declare global {
  interface Window {
    embeddingWorkerAPI: {
      onTask: (callback: (args: { taskId: string, videoBlob: Buffer }) => void) => void;
      sendResult: (result: { taskId: string, result?: any, error?: string }) => void;
    };
  }
}

export {};
