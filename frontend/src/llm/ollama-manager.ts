import { Ollama } from 'ollama';
import type { Message } from 'ollama';

export interface OllamaManagerOptions {
  baseUrl?: string;
  onProgress?: (progress: number) => void;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
  sessionId?: string;
  messages?: ChatMessage[]; // Conversation history for multi-turn conversations
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
  images?: string[]; // Base64 encoded images
}

export class OllamaManager {
  private ollama: Ollama;
  private options: OllamaManagerOptions;
  private modelName = 'gemma3:4b';
  private systemPrompts: Map<string, string> = new Map();
  private readonly fallbackSystemPrompt = 'You are a helpful AI assistant.';

  constructor(options: OllamaManagerOptions = {}) {
    this.options = options;
    this.ollama = new Ollama({
      host: options.baseUrl || 'http://localhost:11434'
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log('Checking Ollama server status...');

      // Check if server is running by listing models
      await this.ollama.list();
      console.log('Ollama server is running');

      // Check if our model is available
      const models = await this.ollama.list();
      const hasModel = models.models.some(m => m.name.includes('gemma3:4b'));

      if (!hasModel) {
        console.log(`Model ${this.modelName} not found, needs to be pulled`);
      } else {
        console.log(`Model ${this.modelName} is available`);
      }
    } catch (error) {
      console.error('Failed to initialize Ollama:', error);
      throw error;
    }
  }

  async pullModel(onProgress?: (percent: number, status: string) => void): Promise<void> {
    console.log(`Pulling model: ${this.modelName}`);

    try {
      const stream = await this.ollama.pull({
        model: this.modelName,
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.status && onProgress) {
          // Calculate progress from completed/total if available
          const percent = chunk.total && chunk.completed
            ? (chunk.completed / chunk.total) * 100
            : 0;
          onProgress(percent, chunk.status);
        }
      }

      console.log(`Model ${this.modelName} pulled successfully`);
    } catch (error) {
      console.error('Failed to pull model:', error);
      throw error;
    }
  }

  async isModelAvailable(): Promise<boolean> {
    try {
      const models = await this.ollama.list();
      return models.models.some(m => m.name.includes(this.modelName));
    } catch (error) {
      console.error('Failed to check model availability:', error);
      return false;
    }
  }

  async createSession(systemPrompt?: string): Promise<string> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Use provided system prompt, or fall back to minimal default
    this.systemPrompts.set(sessionId, systemPrompt || this.fallbackSystemPrompt);

    console.log(`Created session: ${sessionId}`);
    return sessionId;
  }

  async clearSession(sessionId: string): Promise<void> {
    this.systemPrompts.delete(sessionId);
    console.log(`Cleared session: ${sessionId}`);
  }

  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    try {
      const messages: Message[] = [];

      // Add system prompt (use provided, session-specific, or fallback)
      const systemPrompt = options.systemPrompt
        || this.systemPrompts.get(options.sessionId || 'default')
        || this.fallbackSystemPrompt;

      // Build conversation with Gemma's turn-based structure
      let conversationContent = '';

      // Start with system prompt in first user turn
      conversationContent += `<start_of_turn>user\n${systemPrompt}`;

      // Add conversation history if provided
      if (options.messages && options.messages.length > 0) {
        // Add first user message (continuing from system prompt)
        const firstMsg = options.messages[0];
        if (firstMsg.role === 'user') {
          conversationContent += `\n\n${firstMsg.content}<end_of_turn>`;
        }

        // Add remaining messages with proper turn markers
        for (let i = 1; i < options.messages.length; i++) {
          const msg = options.messages[i];
          conversationContent += `\n<start_of_turn>${msg.role === 'user' ? 'user' : 'model'}\n${msg.content}<end_of_turn>`;
        }
      } else {
        // No history, close the system prompt turn
        conversationContent += `<end_of_turn>`;
      }

      // Add current user message
      conversationContent += `\n<start_of_turn>user\n${message}<end_of_turn>\n<start_of_turn>model`;

      const userMessage: Message = {
        role: 'user',
        content: conversationContent
      };

      if (options.images && options.images.length > 0) {
        userMessage.images = options.images;
      }

      messages.push(userMessage);

      const response = await this.ollama.chat({
        model: this.modelName,
        messages,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
          top_p: options.topP ?? 0.9
        }
      });

      return response.message.content;
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  async streamChat(message: string, options: ChatOptions = {}): Promise<void> {
    try {
      const messages: Message[] = [];

      // Add system prompt (use provided, session-specific, or fallback)
      const systemPrompt = options.systemPrompt
        || this.systemPrompts.get(options.sessionId || 'default')
        || this.fallbackSystemPrompt;

      // Build conversation with Gemma's turn-based structure
      let conversationContent = '';

      // Start with system prompt in first user turn
      conversationContent += `<start_of_turn>user\n${systemPrompt}`;

      // Add conversation history if provided
      if (options.messages && options.messages.length > 0) {
        // Add first user message (continuing from system prompt)
        const firstMsg = options.messages[0];
        if (firstMsg.role === 'user') {
          conversationContent += `\n\n${firstMsg.content}<end_of_turn>`;
        }

        // Add remaining messages with proper turn markers
        for (let i = 1; i < options.messages.length; i++) {
          const msg = options.messages[i];
          conversationContent += `\n<start_of_turn>${msg.role === 'user' ? 'user' : 'model'}\n${msg.content}<end_of_turn>`;
        }
      } else {
        // No history, close the system prompt turn
        conversationContent += `<end_of_turn>`;
      }

      // Add current user message
      conversationContent += `\n<start_of_turn>user\n${message}<end_of_turn>\n<start_of_turn>model`;

      const userMessage: Message = {
        role: 'user',
        content: conversationContent
      };

      if (options.images && options.images.length > 0) {
        userMessage.images = options.images;
        console.log(`[Ollama] Processing message with ${options.images.length} image(s)`);
        console.log(`[Ollama] Image sizes:`, options.images.map((img, i) => `${i + 1}: ${(img.length / 1024).toFixed(1)} KB`));
      } else {
        console.log('[Ollama] No images attached to this message');
      }

      messages.push(userMessage);

      const stream = await this.ollama.chat({
        model: this.modelName,
        messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2048,
          top_p: options.topP ?? 0.9
        }
      });

      for await (const chunk of stream) {
        if (chunk.message?.content && options.onChunk) {
          options.onChunk(chunk.message.content);
        }
      }

      if (options.onComplete) {
        options.onComplete();
      }
    } catch (error) {
      console.error('Stream chat error:', error);
      throw error;
    }
  }

  getModelInfo() {
    return {
      name: 'Gemma 3 4B (Multimodal)',
      size: 4_435_402_752, // ~4.13 GB
      quantization: 'Q4_0 (via Ollama)',
      contextSize: 8192,
      loaded: true,
      multimodal: true
    };
  }

  async cleanup(): Promise<void> {
    console.log('Cleaning up Ollama Manager...');
    this.systemPrompts.clear();
    console.log('Ollama Manager cleanup complete');
  }
}
