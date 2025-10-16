// src/embedders/Embedder.ts

/**
 * The base abstract class that all embedder classes must extend.
 * It enforces the implementation of the `embed` method, which
 * takes a specific data source (T) and generates an embedding vector (number[]).
 */
export abstract class Embedder<T> {
  /**
   * Converts the given data into an embedding vector.
   * @param data The data to generate an embedding for (e.g., string, video frame)
   * @returns A Promise containing the embedding vector.
   */
  abstract embed(data: T): Promise<number[]>;
}