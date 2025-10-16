// src/services/embedding.ts

/**
 * 임베딩 생성을 요청하고 관리하는 서비스입니다.
 */
export class EmbeddingService {
  private static instance: EmbeddingService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * 주어진 텍스트에 대한 임베딩 생성을 백엔드에 요청합니다.
   * @param text 임베딩을 생성할 텍스트
   * @returns 생성된 임베딩 벡터(숫자 배열)
   */
  public async createChatEmbedding(text: string): Promise<number[]> {
    // 이 서비스의 유일한 책임은 백엔드 API를 호출하고 결과를 반환하는 것.
    try {
      const vector = await window.llmAPI.createChatEmbedding(text);
      if (!vector) throw new Error('Backend returned null vector.');
      return vector;
    } catch (error) {
      console.error('IPC call for createChatEmbedding failed:', error);
      // 에러를 다시 던져서 Store에서 처리할 수 있도록 함
      throw error;
    }
  }

  // 나중에 비디오 임베딩 함수도 여기에 추가할 수 있습니다.
  // public async createVideoEmbedding(frame: VideoFrame): Promise<number[]> { ... }
}

// Export singleton instance
export const embeddingService = EmbeddingService.getInstance();

