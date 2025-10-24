import { v4 as uuidv4 } from 'uuid';

// Dynamic import types for node-llama-cpp
type Llama = any;
type LlamaModel = any;
type LlamaContext = any;
type LlamaChatSession = any;

export interface LLMManagerOptions {
  modelPath: string;
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
          // console.log(`Model loading: ${(progress * 100).toFixed(1)}%`);
        }
      });

      console.log('Model loaded successfully');

      // Create default session
      await this.createSession();

    } catch (error) {
      console.error('Failed to initialize LLM:', error);
      throw error;
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
      contextSize: 32768
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

  getModelInfo() {
    if (!this.model) {
      return {
        name: 'Unknown',
        size: 0,
        quantization: 'Unknown',
        contextSize: 0,
        loaded: false
      };
    }

    return {
      name: 'Gemma-3n-E4B-IT',
      size: 7_353_292_928,
      quantization: 'Q8_0',
      contextSize: 32768,
      loaded: true
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
