/**
 * EmbeddingService - Renderer-side service for text embedding
 * Provides a clean API for React components
 */
export class EmbeddingService {
  private static instance: EmbeddingService;

  private constructor() {}

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * Embed a query text using DRAGON (768-dim) for chat search
   */
  async embedQuery(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('Embedding API not available');
    }

    try {
      return await window.embeddingAPI.embedQuery(text);
    } catch (error) {
      console.error('Failed to embed query:', error);
      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Embed a context text using DRAGON (768-dim)
   */
  async embedContext(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('Embedding API not available');
    }

    try {
      return await window.embeddingAPI.embedContext(text);
    } catch (error) {
      console.error('Failed to embed context:', error);
      throw new Error('Failed to generate context embedding');
    }
  }

  /**
   * Embed a query text using CLIP (512-dim) for video search
   * Returns null if CLIP text embedding is not available (vision-only model)
   */
  async embedVideoQuery(text: string): Promise<number[] | null> {
    try {
      // Lazy-load ClipVideoEmbedder to avoid circular dependencies
      const { ClipVideoEmbedder } = await import('@/embedding/ClipVideoEmbedder');
      const embedder = await ClipVideoEmbedder.get();
      const embedding = await embedder.embedText(text);
      return Array.from(embedding);
    } catch (error) {
      console.warn('[embedding] CLIP text embedding not available (vision-only model):', error);
      return null;
    }
  }

  /**
   * Check if embedding models are ready
   */
  async isReady(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    
    try {
      return await window.embeddingAPI.isReady();
    } catch {
      return false;
    }
  }

  /**
   * Check if embedding API is available
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.embeddingAPI !== 'undefined';
  }
}

export const embeddingService = EmbeddingService.getInstance();