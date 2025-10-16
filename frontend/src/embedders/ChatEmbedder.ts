// src/embedders/TextEmbedder.ts

import { LLMManager } from '../llm/manager'; // Adjust the path to LLMManager
import { Embedder } from './Embedder';

/**
 * A class that generates embeddings for text data.
 * It uses an LLMManager to perform the actual embedding creation.
 */
export class ChatEmbedder extends Embedder<string> {
  private llmManager: LLMManager;

  /**
   * Creates an instance of ChatEmbedder.
   * @param llmManager An instance of LLMManager
   */
  constructor(llmManager: LLMManager) {
    super(); // Calls the parent class constructor
    this.llmManager = llmManager;
  }

  /**
   * Generates an embedding vector for the given text.
   * @param text The text to generate an embedding for
   * @returns The embedding vector of the text
   */
  public async embed(text: string): Promise<number[]> {
    if (!text || text.trim() === '') {
      throw new Error('Input text cannot be empty.');
    }
    // Directly calls the createEmbedding function implemented in LLMManager
    return this.llmManager.createEmbedding(text);
  }
}