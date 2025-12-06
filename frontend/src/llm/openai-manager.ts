import OpenAI from 'openai';

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
  streamId?: string;
  messages?: ChatMessage[];
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
  images?: string[]; // Base64 encoded images (without data URL prefix)
}

export class StreamCancelledError extends Error {
  constructor(message: string = 'Stream cancelled') {
    super(message);
    this.name = 'StreamCancelledError';
  }
}

export class OpenAIManager {
  private client: OpenAI | null = null;
  private apiKey: string | null = null;
  private modelName = 'gpt-5-mini-2025-08-07'; // GPT-5 mini with vision support (multimodal)
  private systemPrompts: Map<string, string> = new Map();
  private activeStreams: Map<string, AbortController> = new Map();
  private readonly fallbackSystemPrompt = 'You are a helpful AI assistant.';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || null;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  async initialize(apiKey?: string): Promise<void> {
    const key = apiKey || this.apiKey;
    if (!key) {
      throw new Error('OpenAI API key is required');
    }

    try {
      this.client = new OpenAI({ apiKey: key });
      this.apiKey = key;

      // Validate the API key by making a simple request
      await this.client.models.list();
    } catch (error) {
      this.client = null;
      this.apiKey = null;
      console.error('Failed to initialize OpenAI:', error);
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.client !== null && this.apiKey !== null;
  }

  async createSession(systemPrompt?: string): Promise<string> {
    const sessionId = `openai-session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    this.systemPrompts.set(sessionId, systemPrompt || this.fallbackSystemPrompt);
    return sessionId;
  }

  async clearSession(sessionId: string): Promise<void> {
    this.systemPrompts.delete(sessionId);
  }

  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI not initialized. Call initialize() first.');
    }

    try {
      const messages = this.buildMessages(message, options);

      // GPT-5 mini only supports default temperature (1) and top_p values
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages,
        max_completion_tokens: options.maxTokens ?? 2048,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenAI chat error:', error);
      throw error;
    }
  }

  async streamChat(message: string, options: ChatOptions = {}): Promise<void> {
    if (!this.client) {
      throw new Error('OpenAI not initialized. Call initialize() first.');
    }

    const streamId = options.streamId || 'default';
    const abortController = new AbortController();
    this.activeStreams.set(streamId, abortController);

    try {
      const messages = this.buildMessages(message, options);

      // GPT-5 mini only supports default temperature (1) and top_p values
      const stream = await this.client.chat.completions.create(
        {
          model: this.modelName,
          messages,
          stream: true,
          max_completion_tokens: options.maxTokens ?? 2048,
        },
        { signal: abortController.signal }
      );

      for await (const chunk of stream) {
        if (abortController.signal.aborted) {
          throw new StreamCancelledError();
        }

        const content = chunk.choices[0]?.delta?.content;
        if (content && options.onChunk) {
          options.onChunk(content);
        }
      }

      if (!abortController.signal.aborted && options.onComplete) {
        options.onComplete();
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        throw error instanceof StreamCancelledError ? error : new StreamCancelledError();
      }
      console.error('OpenAI stream chat error:', error);
      throw error;
    } finally {
      this.activeStreams.delete(streamId);
    }
  }

  async stopStream(streamId: string): Promise<void> {
    if (!streamId) {
      return;
    }

    const controller = this.activeStreams.get(streamId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(streamId);
    }
  }

  private buildMessages(
    message: string,
    options: ChatOptions
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // Add system prompt
    const systemPrompt =
      options.systemPrompt ||
      this.systemPrompts.get(options.sessionId || 'default') ||
      this.fallbackSystemPrompt;

    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add conversation history
    if (options.messages && options.messages.length > 0) {
      for (const msg of options.messages) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current user message (with optional images for vision)
    if (options.images && options.images.length > 0) {
      // Multimodal message with images
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: message },
        ...options.images.map((img) => ({
          type: 'image_url' as const,
          image_url: {
            url: `data:image/jpeg;base64,${img}`,
            detail: 'auto' as const,
          },
        })),
      ];

      messages.push({
        role: 'user',
        content,
      });
    } else {
      // Text-only message
      messages.push({
        role: 'user',
        content: message,
      });
    }

    return messages;
  }

  async cleanup(): Promise<void> {
    // Stop all active streams
    for (const [, controller] of this.activeStreams) {
      controller.abort();
    }
    this.activeStreams.clear();

    // Clear session prompts
    this.systemPrompts.clear();

    // Clear client reference
    this.client = null;
    this.apiKey = null;
  }
}
