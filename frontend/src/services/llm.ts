import type { LLMChatOptions, LLMStreamChunk, LLMModelInfo } from '@/types/electron';
import { v4 as uuidv4 } from 'uuid';

/**
 * LLM Service - Singleton service for interacting with the LLM
 * Provides a clean API for React components to use
 */
export class LLMService {
  private static instance: LLMService;
  private currentSessionId: string | null = null;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): LLMService {
    if (!LLMService.instance) {
      LLMService.instance = new LLMService();
    }
    return LLMService.instance;
  }

  /**
   * Send a message and get a complete response (non-streaming)
   */
  async sendMessage(message: string, options?: LLMChatOptions): Promise<string> {
    try {
      return await window.llmAPI.chat(message, {
        ...options,
        sessionId: options?.sessionId || this.currentSessionId || undefined
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      throw new Error('Failed to communicate with AI model. Make sure the model is loaded.');
    }
  }

  /**
   * Send a message and receive streaming response
   */
  async streamMessage(
    message: string,
    onChunk: (chunk: string) => void,
    options?: LLMChatOptions
  ): Promise<void> {
    // Generate unique stream ID for this request
    const streamId = uuidv4();

    // Set up listeners with streamId filtering
    const chunkHandler = (chunk: LLMStreamChunk) => {
      // Only process chunks from this specific stream
      if (chunk.streamId === streamId && !chunk.done) {
        onChunk(chunk.chunk);
      }
    };

    window.llmAPI.onStreamChunk(chunkHandler);

    try {
      await window.llmAPI.streamChat(message, {
        ...options,
        sessionId: options?.sessionId || this.currentSessionId || undefined,
        streamId
      });
    } finally {
      window.llmAPI.offStreamChunk(chunkHandler);
    }
  }

  /**
   * Create a new session with optional system prompt
   */
  async createSession(systemPrompt?: string): Promise<string> {
    this.currentSessionId = await window.llmAPI.createSession(systemPrompt);
    return this.currentSessionId;
  }

  /**
   * Clear a session and free its resources
   */
  async clearSession(sessionId?: string): Promise<void> {
    const id = sessionId || this.currentSessionId;
    if (id) {
      await window.llmAPI.clearSession(id);
      if (id === this.currentSessionId) {
        this.currentSessionId = null;
      }
    }
  }

  /**
   * Get information about the current model
   */
  async getModelInfo(): Promise<LLMModelInfo> {
    return await window.llmAPI.getModelInfo();
  }

  /**
   * Get the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Set the current session ID
   */
  setCurrentSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Check if LLM API is available
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.llmAPI !== 'undefined';
  }
}

// Export singleton instance
export const llmService = LLMService.getInstance();
