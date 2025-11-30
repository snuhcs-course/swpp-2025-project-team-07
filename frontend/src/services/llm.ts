import type { LLMChatOptions, LLMStreamChunk, LLMModelInfo } from '@/types/electron';
import { v4 as uuidv4 } from 'uuid';

/**
 * LLM Service - Singleton service for interacting with the LLM
 * Provides a clean API for React components to use
 */
export class LLMService {
  private static instance: LLMService;
  private currentSessionId: string | null = null;
  private activeStream:
    | {
        streamId: string;
        chunkHandler: (chunk: LLMStreamChunk) => void;
        isStopped: boolean;
        promise: Promise<void>;
      }
    | null = null;

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
   * @param message - The current message to send
   * @param onChunk - Callback for streaming chunks
   * @param options - Optional chat options including message history
   */
  async streamMessage(
    message: string,
    onChunk: (chunk: string) => void,
    options?: LLMChatOptions
  ): Promise<void> {
    if (this.activeStream) {
      const previousStream = this.activeStream;
      if (!previousStream.isStopped) {
        await previousStream.promise.catch(() => undefined);
      } else {
        window.llmAPI.offStreamChunk(previousStream.chunkHandler);
      }
      if (this.activeStream === previousStream) {
        this.activeStream = null;
      }
    }

    // Generate unique stream ID for this request
    const streamId = uuidv4();

    // Set up listeners with streamId filtering
    const chunkHandler = (chunk: LLMStreamChunk) => {
      // Only process chunks from this specific stream
      if (
        chunk.streamId === streamId &&
        !chunk.done &&
        this.activeStream &&
        !this.activeStream.isStopped
      ) {
        onChunk(chunk.chunk);
      }
    };

    window.llmAPI.onStreamChunk(chunkHandler);

    const streamPromise = window.llmAPI.streamChat(message, {
      ...options,
      sessionId: options?.sessionId || this.currentSessionId || undefined,
      streamId,
      messages: options?.messages // Pass conversation history if provided
    });

    const activeStreamState = {
      streamId,
      chunkHandler,
      isStopped: false,
      promise: streamPromise
    };

    this.activeStream = activeStreamState;

    try {
      await streamPromise;
    } finally {
      window.llmAPI.offStreamChunk(chunkHandler);
      if (this.activeStream === activeStreamState) {
        this.activeStream = null;
      }
    }

    if (activeStreamState.isStopped) {
      const error = new Error('StreamCancelledError');
      error.name = 'StreamCancelledError';
      throw error;
    }
  }

  async stopStreaming(): Promise<void> {
    const active = this.activeStream;
    if (!active || active.isStopped) {
      return;
    }

    active.isStopped = true;
    window.llmAPI.offStreamChunk(active.chunkHandler);

    try {
      await window.llmAPI.stopStream(active.streamId);
    } catch (error) {
      console.warn('[LLMService] Failed to stop stream via IPC:', error);
    }

    try {
      await active.promise;
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'StreamCancelledError') {
        throw error;
      }
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

  /**
   * Generate a concise title for a conversation based on the first user message
   * and assistant response. Uses the local LLM (Gemma-3) for generation.
   */
  async generateTitle(userMessage: string, assistantResponse: string): Promise<string> {
    try {
      const prompt = `Based on the following conversation, generate a very short and concise title (maximum 5 words, no quotes or punctuation at the end):

User: ${userMessage.substring(0, 200)}
Assistant: ${assistantResponse.substring(0, 200)}

Title:`;

      const title = await window.llmAPI.chat(prompt, {
        temperature: 0.3,
        maxTokens: 20,
      });

      // Clean up the title (remove quotes, trim, limit length)
      return title
        .trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/[.!?]+$/, '') // Remove trailing punctuation
        .substring(0, 50); // Limit to 50 characters
    } catch (error) {
      console.error('Failed to generate title:', error);
      // Fallback to a simple title based on first words of user message
      return userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '');
    }
  }
}

// Export singleton instance
export const llmService = LLMService.getInstance();
