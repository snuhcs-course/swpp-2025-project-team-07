// VectorDB API service - stores chat embeddings for memory

import { apiRequestWithAuth } from '@/utils/apiRequest';

// Vector data for insertion (combined messages → 1 vector entry)
export interface VectorData {
  id: string; // REQUIRED primary key
  vector: number[]; // 768-dim embedding from DRAGON
  content: string; // ENCRYPTED (may be combined: "User: q\n\nAssistant: a")
  timestamp: number;
  session_id: number;
  role: string; // 'user' | 'assistant' | 'conversation'
  message_ids?: number[];
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
  screen_scores?: number[][];
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

export async function insertBothData(
  chatData?: VectorData[],
  screenData?: VectorData[]
): Promise<InsertResponse> {
  const payload: { chat_data?: VectorData[]; screen_data?: VectorData[] } = {};
  if (chatData && chatData.length > 0) payload.chat_data = chatData;
  if (screenData && screenData.length > 0) payload.screen_data = screenData;
  if (!payload.chat_data && !payload.screen_data) {
    throw new Error('At least one of chat_data or screen_data must be provided');
  }
  return apiRequestWithAuth<InsertResponse>('/api/collections/insert/', {
    method: 'POST',
    body: JSON.stringify(payload),
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

export async function searchScreenData(queryVectors: number[][]): Promise<SearchResponse> {
  return apiRequestWithAuth<SearchResponse>('/api/collections/search/', {
    method: 'POST',
    body: JSON.stringify({
      screen_data: queryVectors.map(vector => ({ vector }))
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

// Helper: Extract top-K indices from scores (descending order)
export function getTopKIndices(scores: number[], k: number): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(item => item.index);
}

// Complete RAG flow: Search + Query top-K + Decrypt
export async function searchAndQuery(
  queryVector: number[],
  topK: number = 5
): Promise<VectorData[]> {
  const searchResult = await searchChatData([queryVector]);
  if (!searchResult.ok || !searchResult.chat_scores || searchResult.chat_scores.length === 0) {
    return [];
  }

  const scores = searchResult.chat_scores[0];
  const topIndices = getTopKIndices(scores, topK);
  if (topIndices.length === 0) return [];

  const queryResult = await queryChatData(topIndices.map(String));
  if (!queryResult.ok || !queryResult.chat_results) return [];

  const { decryptText } = await import('@/utils/encryption');
  const decryptedResults = await Promise.all(
    queryResult.chat_results.map(async (doc) => ({
      ...doc,
      content: await decryptText(doc.content).catch(() => '[Decryption Error]')
    }))
  );

  return decryptedResults;
}

export const collectionService = {
  insertChatData,
  insertScreenData,
  insertBothData,
  searchChatData,
  searchScreenData,
  queryChatData,
  queryScreenData,
  searchAndQuery,
  getTopKIndices,
};
