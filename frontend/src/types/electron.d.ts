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

declare global {
  interface Window {
    llmAPI: {
      // Chat methods
      chat: (message: string, options?: LLMChatOptions) => Promise<string>;
      streamChat: (
        message: string,
        options?: LLMChatOptions
      ) => Promise<void>;
      createChatEmbedding: (text: string) => Promise<number[]>;

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
  }
}

export {};
