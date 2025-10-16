import { v4 as uuidv4 } from 'uuid';
// env 설정 없이 pipeline만 import
import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

// Dynamic import types for node-llama-cpp
type Llama = any;
type LlamaModel = any;
type LlamaContext = any;
type LlamaChatSession = any;

export interface LLMManagerOptions {
  modelPath: string;
  // ADDED: 사용할 임베딩 모델의 이름을 옵션으로 추가할 수 있습니다.
  embeddingModel?: string;
  onProgress?: (progress: number) => void;
  onEmbeddingProgress?: (status: string, progress?: number) => void;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
  sessionId?: string;
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
}

interface SessionData {
  id: string;
  context: LlamaContext;
  session: LlamaChatSession;
  systemPrompt?: string;
  createdAt: Date;
  messageCount: number;
  maxMessages: number;
}

export class LLMManager {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private embeddingPipeline: FeatureExtractionPipeline | null = null;
  private sessions: Map<string, SessionData> = new Map();
  private options: LLMManagerOptions;
  private defaultSessionId: string = 'default';

  constructor(options: LLMManagerOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing llama.cpp...');

      // Dynamic import of node-llama-cpp (ESM module with top-level await)
      const { getLlama, LlamaChatSession: LlamaChatSessionClass } = await import('node-llama-cpp');

      // Store the session class for later use
      (this as any).LlamaChatSessionClass = LlamaChatSessionClass;

      this.llama = await getLlama();

      console.log('Loading model from:', this.options.modelPath);
      this.model = await this.llama.loadModel({
        modelPath: this.options.modelPath,
        onLoadProgress: (progress: number) => {
          if (this.options.onProgress) {
            this.options.onProgress(progress);
          }
          // console.log(`Model loading: ${(progress * 100).toFixed(1)}%`);
        }
      });

      console.log('Model loaded successfully');
      
      // 임베딩 모델 로드
      await this.initializeEmbeddingModel();

      // Create default session
      await this.createSession();

    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      throw error;
    }
  }

  private async initializeEmbeddingModel(): Promise<void> {
    // 💡 수정: 문제의 모델 이름 대신, 호환성이 검증된 새 모델 이름을 사용합니다.
    const embeddingModelName = 'Xenova/all-MiniLM-L6-v2';
    
    try {
      if (this.options.onEmbeddingProgress) {
        this.options.onEmbeddingProgress('Initializing embedding model...', 0);
      }
      
      console.log('Loading embedding model:', embeddingModelName);
      
      // ✅ 가장 간단한 원래의 코드로 복귀
      // 이 코드 하나로 다운로드부터 로딩까지 모두 자동으로 처리됩니다.
      this.embeddingPipeline = await pipeline(
        'feature-extraction', 
        embeddingModelName,
        {
          progress_callback: (progress: any) => {
            if (progress.status === 'progress' && progress.file) {
              const percent = (progress.loaded / progress.total) * 100;
              console.log(`Downloading ${progress.file}: ${percent.toFixed(1)}%`);
              
              if (this.options.onEmbeddingProgress) {
                this.options.onEmbeddingProgress(
                  `Downloading ${progress.file}...`,
                  percent
                );
              }
            } else if (progress.status === 'done') {
              console.log(`Downloaded: ${progress.file}`);
            }
          }
        }
      );
      
      if (this.options.onEmbeddingProgress) {
        this.options.onEmbeddingProgress('Embedding model ready', 100);
      }
      
      console.log('Embedding model loaded successfully');
      
    } catch (error) {
      console.error('Failed to load embedding model:', error);
      throw new Error(`Failed to initialize embedding model: ${error}`);
    }
  }

  async createSession(systemPrompt?: string): Promise<string> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    const LlamaChatSessionClass = (this as any).LlamaChatSessionClass;
    if (!LlamaChatSessionClass) {
      throw new Error('LlamaChatSession class not loaded');
    }

    const sessionId = uuidv4();
    const context = await this.model.createContext({
      contextSize: 8192 // Gemma 3 context window
    });

    const session = new LlamaChatSessionClass({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt || 'You are a helpful AI assistant.'
    });

    this.sessions.set(sessionId, {
      id: sessionId,
      context,
      session,
      systemPrompt,
      createdAt: new Date(),
      messageCount: 0,
      maxMessages: 100
    });

    // Set as default if it's the first session
    if (this.sessions.size === 1) {
      this.defaultSessionId = sessionId;
    }

    console.log(`Created session: ${sessionId}`);
    return sessionId;
  }

  async clearSession(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId);
    if (sessionData) {
      // Dispose context to free memory
      sessionData.context.dispose();
      this.sessions.delete(sessionId);
      console.log(`Cleared session: ${sessionId}`);
    }
  }

  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    const sessionId = options.sessionId || this.defaultSessionId;
    const sessionData = this.sessions.get(sessionId);

    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      const response = await sessionData.session.prompt(message, {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
        topP: options.topP ?? 0.9,
      });

      sessionData.messageCount++;
      return response;
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  async streamChat(message: string, options: ChatOptions = {}): Promise<void> {
    const sessionId = options.sessionId || this.defaultSessionId;
    const sessionData = this.sessions.get(sessionId);

    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      await sessionData.session.prompt(message, {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
        topP: options.topP ?? 0.9,
        onTextChunk: (chunk: string) => {
          if (options.onChunk) {
            options.onChunk(chunk);
          }
        }
      });

      sessionData.messageCount++;

      if (options.onComplete) {
        options.onComplete();
      }
    } catch (error) {
      console.error('Stream chat error:', error);
      throw error;
    }
  }

    /**
   * Generates an embedding vector for the given text.
   * @param text The input text to create an embedding for.
   * @returns A promise that resolves to an array of numbers (the embedding vector).
   */
  async createEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingPipeline) {
      throw new Error('Embedding model not loaded. Cannot create embedding.');
    }

    try {
      // 파이프라인을 실행하여 텍스트로부터 임베딩 텐서를 생성합니다.
      // pooling: 'mean' 과 normalize: true 는 문장 임베딩 생성 시 표준적인 옵션입니다.
      const embeddingTensor = await this.embeddingPipeline(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      // 텐서 데이터를 일반 JavaScript 배열로 변환하여 반환합니다.
      const embedding = Array.from(embeddingTensor.data as Float32Array);
      // 💡 수정: slice(0, 10)을 사용해 배열의 첫 10개 요소를 가져와 로그에 추가합니다.
      // toFixed(4)로 소수점 4자리까지만 표시하여 가독성을 높였습니다.
      const preview = embedding.slice(0, 10).map(n => n.toFixed(4)).join(', ');
      console.log(`Generated embedding vector (dim: ${embedding.length}): [${preview}...]`);
      
      return embedding;
    } catch (error) {
      console.error('Failed to create embedding:', error);
      throw new Error('An error occurred while generating the embedding.');
    }
  }

  isEmbeddingModelReady(): boolean {
    return this.embeddingPipeline !== null;
  }

  getModelInfo() {
    if (!this.model) {
      return {
        name: 'Unknown',
        size: 0,
        quantization: 'Unknown',
        contextSize: 0,
        loaded: false,
        embeddingModelReady: false
      };
    }

    return {
      name: 'Gemma-3-12B-IT',
      size: 6_909_282_656, // ~6.4GB
      quantization: 'Q4_0',
      contextSize: 8192,
      loaded: true,
      embeddingModelReady: this.isEmbeddingModelReady()
    };
  }

  async cleanup(): Promise<void> {
    console.log('Cleaning up LLM Manager...');

    // Dispose all sessions
    for (const [sessionId, sessionData] of this.sessions) {
      sessionData.context.dispose();
    }
    this.sessions.clear();

    // Dispose model
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }

    // Dispose embedding pipeline
    if (this.embeddingPipeline) {
      if (typeof (this.embeddingPipeline.model as any).dispose === 'function') {
        await (this.embeddingPipeline.model as any).dispose();
      }
      this.embeddingPipeline = null;
    }

    this.llama = null;
    console.log('LLM Manager cleanup complete');
  }

  // Cleanup old sessions to manage memory
  async cleanupOldSessions(maxAge: number = 3600000): Promise<void> {
    const now = Date.now();

    for (const [sessionId, sessionData] of this.sessions) {
      const age = now - sessionData.createdAt.getTime();
      if (age > maxAge && sessionId !== this.defaultSessionId) {
        await this.clearSession(sessionId);
      }
    }
  }

  // Get session count for monitoring
  getSessionCount(): number {
    return this.sessions.size;
  }

  // Get all session IDs
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}
