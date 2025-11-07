import { Ollama } from 'ollama';
import type { Message } from 'ollama';

export interface OllamaManagerOptions {
  baseUrl?: string;
  onProgress?: (progress: number) => void;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
  sessionId?: string;
   streamId?: string;
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
  images?: string[]; // Base64 encoded images
}

export class StreamCancelledError extends Error {
  constructor(message: string = 'Stream cancelled') {
    super(message);
    this.name = 'StreamCancelledError';
  }
}

export class OllamaManager {
  private ollama: Ollama;
  private options: OllamaManagerOptions;
  private modelName = 'gemma3:4b';
  private systemPrompts: Map<string, string> = new Map();
  private activeStreams: Map<string, { iterator: AsyncIterator<any>; stopped: boolean }> = new Map();
  private readonly defaultSystemPrompt = `You are a helpful AI assistant with access to the user's conversation history and screen recordings.

When you see a message that starts with <CONTEXT> tags, this contains real information from the user's past conversations with you.
You can treat this information as factual and use it to answer questions.
The context is provided to help you remember previous interactions across different chat sessions.

Additionally, you may receive screen recording frames as images. These are extracted from the user's screen recordings at 1 frame per second.
Each sequence of images represents a continuous screen recording session showing what the user was doing or seeing.
When multiple images are provided together, they show the progression of activity over time (1 image = 1 second of recording).
Analyze these frame sequences to understand what was visible on the user's screen and help answer questions about their activities.

If asked about information that appears in the <CONTEXT> section or in provided images,
answer confidently using that information as if you already know it.`;

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

    // Use provided system prompt, or fall back to default
    this.systemPrompts.set(sessionId, systemPrompt || this.defaultSystemPrompt);

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

      // Add system prompt (use provided, session-specific, or default)
      const systemPrompt = options.systemPrompt
        || this.systemPrompts.get(options.sessionId || 'default')
        || this.defaultSystemPrompt;

      messages.push({
        role: 'system',
        content: systemPrompt
      });

      // Add user message with optional images
      const userMessage: Message = {
        role: 'user',
        content: message
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
      const streamId = options.streamId || 'default';

      // Add system prompt (use provided, session-specific, or default)
      const systemPrompt = options.systemPrompt
        || this.systemPrompts.get(options.sessionId || 'default')
        || this.defaultSystemPrompt;

      messages.push({
        role: 'system',
        content: systemPrompt
      });

      // Add user message with optional images
      const userMessage: Message = {
        role: 'user',
        content: message
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

      const iterator = stream[Symbol.asyncIterator]();
      const entry = { iterator, stopped: false };
      this.activeStreams.set(streamId, entry);

      try {
        while (true) {
          if (entry.stopped) {
            throw new StreamCancelledError();
          }

          const { value, done } = await iterator.next();
          if (done) {
            break;
          }

          if (entry.stopped) {
            throw new StreamCancelledError();
          }

          if (value?.message?.content && options.onChunk) {
            options.onChunk(value.message.content);
          }
        }

        if (entry.stopped) {
          throw new StreamCancelledError();
        }

        if (options.onComplete) {
          options.onComplete();
        }
      } catch (error) {
        if (entry.stopped) {
          throw error instanceof StreamCancelledError ? error : new StreamCancelledError();
        }
        throw error;
      } finally {
        this.activeStreams.delete(streamId);
      }
    } catch (error) {
      console.error('Stream chat error:', error);
      throw error;
    }
  }

  async stopStream(streamId: string): Promise<void> {
    if (!streamId) {
      return;
    }

    const entry = this.activeStreams.get(streamId);
    if (!entry) {
      return;
    }

    entry.stopped = true;

    try {
      if (typeof entry.iterator.return === 'function') {
        await entry.iterator.return();
      }
    } catch (error) {
      console.warn('[OllamaManager] Failed to stop stream gracefully:', error);
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
