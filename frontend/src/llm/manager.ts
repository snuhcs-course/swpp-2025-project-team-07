import { v4 as uuidv4 } from 'uuid';
// pipeline과 환경 설정 import
import { pipeline, FeatureExtractionPipeline, env } from '@xenova/transformers';

// Dynamic import types for node-llama-cpp
type Llama = any;
type LlamaModel = any;
type LlamaContext = any;
type LlamaChatSession = any;

export interface LLMManagerOptions {
  modelPath: string;
  chatQueryEncoderPath: string;
  chatKeyEncoderPath: string;
  onProgress?: (progress: number) => void;
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
  private chatQueryEncoder: FeatureExtractionPipeline | null = null;
  private chatKeyEncoder: FeatureExtractionPipeline | null = null;
  private sessions: Map<string, SessionData> = new Map();
  private options: LLMManagerOptions;
  private defaultSessionId: string = 'default';

  constructor(options: LLMManagerOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing llama.cpp...');

      // Dynamic import of node-llama-cpp
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
          console.log(`Model loading: ${(progress * 100).toFixed(1)}%`);
        }
      });

      console.log('Model loaded successfully');
      
      await this.initializeEmbeddingModels();

      // Create default session
      await this.createSession();

    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      throw error;
    }
  }

  private async initializeEmbeddingModels(): Promise<void> {
    try {
      console.log('Loading embedding models from local paths...');
      
      // [중요] Transformers.js 환경 설정
      env.allowLocalModels = true;        // 로컬 모델 허용
      env.allowRemoteModels = false;      // 원격 다운로드 방지
      env.useBrowserCache = false;        // 브라우저 캐시 사용 안 함
      
      // 1. 쿼리 인코더 로드
      console.log('Loading Chat Query Encoder from:', this.options.chatQueryEncoderPath);
      
      try {
        this.chatQueryEncoder = await pipeline(
          'feature-extraction', 
          this.options.chatQueryEncoderPath,
          {
            local_files_only: true,
            revision: 'main',
          }
        );
        console.log('Chat Query Encoder loaded successfully.');
      } catch (error: any) {
        console.error('Failed to load Chat Query Encoder:', error.message);

        // Fallback: Hugging Face에서 직접 다운로드 시도
        console.log('Attempting to load Chat Query Encoder from Hugging Face...');
        env.allowRemoteModels = true;
        this.chatQueryEncoder = await pipeline(
          'feature-extraction',
          'nvidia/dragon-multiturn-query-encoder'
        );
        env.allowRemoteModels = false;
        console.log('Chat Query Encoder loaded from Hugging Face.');
      }

      // 2. 컨텍스트 인코더 로드
      console.log('Loading Chat Key Encoder from:', this.options.chatKeyEncoderPath);

      try {
        this.chatKeyEncoder = await pipeline(
          'feature-extraction',
          this.options.chatKeyEncoderPath,
          {
            local_files_only: true,
            revision: 'main',
          }
        );
        console.log('Chat Key Encoder loaded successfully.');
      } catch (error: any) {
        console.error('Failed to load Chat Key Encoder:', error.message);

        // Fallback: Hugging Face에서 직접 다운로드 시도
        console.log('Attempting to load Chat Key Encoder from Hugging Face...');
        env.allowRemoteModels = true;
        this.chatKeyEncoder = await pipeline(
          'feature-extraction',
          'nvidia/dragon-multiturn-context-encoder'
        );
        env.allowRemoteModels = false;
        console.log('Chat Key Encoder loaded from Hugging Face.');
      }

      console.log('All embedding models loaded successfully');

    } catch (error) {
      console.error('Failed to load embedding models:', error);
      throw new Error(`Failed to initialize embedding models: ${error}`);
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
      contextSize: 8192
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
   * 컨텍스트 인코더를 사용하여 임베딩 생성 (문서/컨텍스트용)
   */
  async createEmbedding(text: string): Promise<number[]> {
    if (!this.chatKeyEncoder) {
      throw new Error('Context Encoder model not loaded. Cannot create embedding.');
    }

    try {
      const embeddingTensor = await this.chatKeyEncoder(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      const embedding = Array.from(embeddingTensor.data as Float32Array);
      const preview = embedding.slice(0, 10).map(n => n.toFixed(4)).join(', ');
      console.log(`Generated CONTEXT embedding (dim: ${embedding.length}): [${preview}...]`);
      
      return embedding;
    } catch (error) {
      console.error('Failed to create context embedding:', error);
      throw new Error('An error occurred while generating the context embedding.');
    }
  }

  /**
   * 쿼리 인코더를 사용하여 임베딩 생성 (사용자 질문용)
   */
  async createQueryEmbedding(text: string): Promise<number[]> {
    if (!this.chatQueryEncoder) {
      throw new Error('Query Encoder model not loaded. Cannot create chat embedding.');
    }

    try {
      const embeddingTensor = await this.chatQueryEncoder(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      const embedding = Array.from(embeddingTensor.data as Float32Array);
      const preview = embedding.slice(0, 10).map(n => n.toFixed(4)).join(', ');
      console.log(`Generated QUERY embedding (dim: ${embedding.length}): [${preview}...]`);
      
      return embedding;
    } catch (error) {
      console.error('Failed to create query embedding:', error);
      throw new Error('An error occurred while generating the query embedding.');
    }
  }

  isEmbeddingModelReady(): boolean {
    return this.chatQueryEncoder !== null && this.chatKeyEncoder !== null;
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
      size: 6_909_282_656,
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

    // Dispose embedding pipelines
    if (this.chatQueryEncoder) {
      if (typeof (this.chatQueryEncoder.model as any).dispose === 'function') {
        await (this.chatQueryEncoder.model as any).dispose();
      }
      this.chatQueryEncoder = null;
    }
    if (this.chatKeyEncoder) {
      if (typeof (this.chatKeyEncoder.model as any).dispose === 'function') {
        await (this.chatKeyEncoder.model as any).dispose();
      }
      this.chatKeyEncoder = null;
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
