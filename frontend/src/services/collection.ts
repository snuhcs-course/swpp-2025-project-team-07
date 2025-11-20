// VectorDB API service - stores chat embeddings for memory

import { apiRequestWithAuth } from '@/utils/apiRequest';

// Vector data for insertion (combined messages → 1 vector entry)
export interface VectorData {
  id: string; // REQUIRED primary key
  vector: number[]; // 768-dim embedding from DRAGON
  content: string; // ENCRYPTED (may be combined: "User: q\n\nAssistant: a")
  timestamp: number;
  session_id: number;
  role: string; // 'user' | 'assistant' | 'conversation' | 'screen_recording'
  message_ids?: number[];
  source_type?: 'chat' | 'screen'; // Added during retrieval
  video_blob?: Blob; // Reconstructed video blob for screen recordings
  duration?: number; // Video duration in ms
  frame_count?: number; // Number of frames
  [key: string]: any;
}

export interface InsertResponse {
  ok: boolean;
  result: {
    chat_insert_count?: number;
    screen_insert_count?: number;
  };
}

// Search returns similarity scores for ALL vectors
export interface SearchResponse {
  ok: boolean;
  chat_scores?: number[][];
  chat_ids?: string[][];
  screen_scores?: number[][];
  screen_ids?: string[][];
}

export interface QueryResponse {
  ok: boolean;
  chat_results?: VectorData[];
  screen_results?: VectorData[];
}

// Insert - vectorDB requires array format
export async function insertChatData(chatData: VectorData[]): Promise<InsertResponse> {
  return apiRequestWithAuth<InsertResponse>('/api/collections/insert/', {
    method: 'POST',
    body: JSON.stringify({ chat_data: chatData }),
  });
}

export async function insertScreenData(screenData: VectorData[]): Promise<InsertResponse> {
  return apiRequestWithAuth<InsertResponse>('/api/collections/insert/', {
    method: 'POST',
    body: JSON.stringify({ screen_data: screenData }),
  });
}

// Search - returns scores for ALL vectors in collection
export async function searchChatData(queryVectors: number[][]): Promise<SearchResponse> {
  return apiRequestWithAuth<SearchResponse>('/api/collections/search/', {
    method: 'POST',
    body: JSON.stringify({
      chat_data: queryVectors.map(vector => ({ vector }))
    }),
  });
}

// Query - fetch specific documents by index
export async function queryChatData(
  indices: string[],
  outputFields: string[] = ['content', 'timestamp', 'session_id', 'role']
): Promise<QueryResponse> {
  return apiRequestWithAuth<QueryResponse>('/api/collections/query/', {
    method: 'POST',
    body: JSON.stringify({
      chat_ids: indices,
      chat_output_fields: outputFields,
    }),
  });
}

export async function queryScreenData(
  indices: string[],
  outputFields: string[]
): Promise<QueryResponse> {
  return apiRequestWithAuth<QueryResponse>('/api/collections/query/', {
    method: 'POST',
    body: JSON.stringify({
      screen_ids: indices,
      screen_output_fields: outputFields,
    }),
  });
}

export async function queryBothData(
  indices: string[],
  outputFields: string[]
): Promise<QueryResponse> {
  return apiRequestWithAuth<QueryResponse>('/api/collections/query/', {
    method: 'POST',
    body: JSON.stringify({
      chat_ids: indices,
      chat_output_fields: outputFields,
      screen_ids: indices,
      screen_output_fields: outputFields,
    }),
  });
}

// Helper: Extract top-K indices from scores (descending order)
export function getTopKIndices(scores: number[], k: number): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(item => item.index);
}

// Helper: Convert base64 to video Blob
async function base64ToVideoBlob(base64: string, mimeType: string): Promise<Blob> {
  try {
    // Decode base64 to binary string
    const binaryString = atob(base64);

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create blob with correct MIME type
    const blob = new Blob([bytes], { type: mimeType });

    if (blob.size === 0) {
      throw new Error('Created blob is empty!');
    }

    console.log('[VideoReconstruction] Created video blob:', blob.size, 'bytes');
    return blob;
  } catch (error) {
    console.error('[VideoReconstruction] Error converting base64 to blob:', error);
    throw error;
  }
}

// Complete RAG flow: Search + Query top-K + Decrypt (unified chat + video)
export async function searchAndQuery(
  chatQueryVector: number[],
  chatTopK: number = 7,
  videoQueryVector?: number[], // Optional: separate embedding for video search
  videoTopK: number = 3, // Optional: top-K for video (defaults to 3)
  excludeSessionId?: number, // Optional: exclude memories from this session (to avoid redundancy)
): Promise<VectorData[]> {
  // Search both collections in parallel with appropriate embeddings
  let searchResult: SearchResponse;

  if (videoQueryVector) {
    // Use separate embeddings for chat (768-dim DRAGON) and video (512-dim CLIP)
    searchResult = await apiRequestWithAuth<SearchResponse>('/api/collections/search/', {
      method: 'POST',
      body: JSON.stringify({
        chat_data: [{ vector: chatQueryVector }],
        screen_data: [{ vector: videoQueryVector }]
      }),
    });
  } else {
    // Fallback: only search chat data if no video embedding provided
    searchResult = await searchChatData([chatQueryVector]);
  }

  // Get top-K from EACH collection separately (not mixed)
  let chatIds: string[] = [];
  let screenIds: string[] = [];

  // Get top-K chat results
  if (searchResult.ok && searchResult.chat_scores && searchResult.chat_ids &&
      searchResult.chat_scores.length > 0 && searchResult.chat_ids.length > 0) {
    const scores = searchResult.chat_scores[0];
    const ids = searchResult.chat_ids[0];

    // Pair scores with IDs and sort by score (descending)
    chatIds = scores
      .map((score: number, index: number) => ({ score, id: ids[index] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, chatTopK)
      .map(item => item.id);
  }

  // Get top-K screen results (only if video search was performed)
  if (videoQueryVector && searchResult.ok && searchResult.screen_scores && searchResult.screen_ids &&
      searchResult.screen_scores.length > 0 && searchResult.screen_ids.length > 0) {
    const scores = searchResult.screen_scores[0];
    const ids = searchResult.screen_ids[0];

    // Pair scores with IDs and sort by score (descending)
    screenIds = scores
      .map((score: number, index: number) => ({ score, id: ids[index] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, videoTopK)
      .map(item => item.id);
  }

  if (chatIds.length === 0 && screenIds.length === 0) return [];

  // Query collections based on what we have (use correct IDs for each collection)
  let queryResult: QueryResponse;
  const outputFields = ['content', 'timestamp', 'session_id', 'role'];

  if (chatIds.length > 0 && screenIds.length > 0) {
    // Query both collections in parallel with their respective IDs
    const [chatResult, screenResult] = await Promise.all([
      queryChatData(chatIds, outputFields),
      queryScreenData(screenIds, outputFields)
    ]);
    // Combine results
    queryResult = {
      ok: chatResult.ok && screenResult.ok,
      chat_results: chatResult.chat_results,
      screen_results: screenResult.screen_results,
    };
  } else if (chatIds.length > 0) {
    queryResult = await queryChatData(chatIds, outputFields);
  } else {
    queryResult = await queryScreenData(screenIds, outputFields);
  }

  // Combine results and tag with source type
  const allResults: VectorData[] = [
    ...(queryResult.chat_results || []).map(doc => ({ ...doc, source_type: 'chat' as const })),
    ...(queryResult.screen_results || []).map(doc => ({ ...doc, source_type: 'screen' as const }))
  ];

  // Filter out same-session memories
  const filteredResults = excludeSessionId !== undefined
    ? allResults.filter(doc => doc.session_id === 0 || doc.session_id !== excludeSessionId)
    : allResults;

  // Decrypt all results and reconstruct videos for screen recordings
  const { decryptText } = await import('@/utils/encryption');
  const decryptedResults = await Promise.all(
    filteredResults.map(async (doc) => {
      const decryptedContent = await decryptText(doc.content).catch(() => '[Decryption Error]');

      // If this is a screen recording, reconstruct the original video blob
      if (doc.source_type === 'screen' && decryptedContent !== '[Decryption Error]') {
        try {
          const payload = JSON.parse(decryptedContent);

          // New format: original video blob stored as base64
          if (payload.video_base64) {
            const videoBlob = await base64ToVideoBlob(
              payload.video_base64,
              payload.video_type || 'video/webm'
            );
            return {
              ...doc,
              content: decryptedContent,
              video_blob: videoBlob,
              duration: payload.duration,
              width: payload.width,
              height: payload.height,
            };
          }
        } catch (e) {
          console.error('Failed to reconstruct video:', e);
        }
      }

      return {
        ...doc,
        content: decryptedContent
      };
    })
  );

  return decryptedResults;
}

export const collectionService = {
  insertChatData,
  insertScreenData,
  searchChatData,
  queryChatData,
  queryScreenData,
  searchAndQuery,
  getTopKIndices,
};
