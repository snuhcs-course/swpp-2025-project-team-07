// VectorDB API service - stores chat embeddings for memory

import { apiRequestWithAuth } from '@/utils/apiRequest';
import { type AuthUser } from '.@/services/auth';
import { decryptText } from '@/utils/encryption'

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
  video_set_id?: string | null; // REQUIRED primary key for each video set
  video_set_videos?: VectorData[];
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

export interface VideoSetResult {
  video_set_id: string;
  representative_id?: string;
  videos: VectorData[];
}

export interface QueryResponse {
  ok: boolean;
  chat_results?: VectorData[];
  screen_results?: (VectorData | VideoSetResult)[];
}

// Insert - vectorDB requires array format
export async function insertChatData(chatData: VectorData[]): Promise<InsertResponse> {
  return apiRequestWithAuth<InsertResponse>('/api/collections/insert/', {
    method: 'POST',
    body: JSON.stringify({ chat_data: chatData }),
  });
}

export async function insertScreenData(
  screenData: VectorData[],
  collection_version?: string
): Promise<InsertResponse> {
  return apiRequestWithAuth<InsertResponse>('/api/collections/insert/', {
    method: 'POST',
    body: JSON.stringify({ 
      screen_data: screenData,
      collection_version: collection_version,
    }),
  });
}

export interface ClearCollectionsRequest {
  user_id: number;
  clear_chat: boolean;
  clear_screen: boolean;
  collection_version?: string;
}

export interface ClearCollectionsResponse {
  ok: boolean;
  message: string;
}

export async function clearCollections(
  user: AuthUser,
  collection_version: string,
  clear_chat: boolean = false,
  clear_screen: boolean = true
): Promise<ClearCollectionsResponse> {
  return apiRequestWithAuth<ClearCollectionsResponse>('/api/collections/clear/', {
    method: 'POST',
    body: JSON.stringify({
      user_id: user.id,
      clear_chat: clear_chat,
      clear_screen: clear_screen,
      collection_version: collection_version,
    }),
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
  outputFields: string[],
  collection_version: string = 'video_set',
  chatIds: string[] = [],
  chatOutputFields?: string[],
  queryVideoSets: boolean = true
): Promise<QueryResponse> {
  const body: Record<string, unknown> = {
    screen_ids: indices,
    screen_output_fields: outputFields,
  };

  if (queryVideoSets || chatIds.length > 0) {
    body.chat_ids = chatIds;
    body.chat_output_fields = chatOutputFields ?? outputFields;
  }

  if (queryVideoSets) {
    body.query_video_sets = true;
    body.collection_version = collection_version;
  }

  return apiRequestWithAuth<QueryResponse>('/api/collections/query/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function queryBothData(
  indices: string[],
  outputFields: string[],
  collection_version: string = 'video_set',
  queryVideoSets: boolean = true
): Promise<QueryResponse> {
  return apiRequestWithAuth<QueryResponse>('/api/collections/query/', {
    method: 'POST',
    body: JSON.stringify({
      chat_ids: indices,
      chat_output_fields: outputFields,
      screen_ids: indices,
      screen_output_fields: outputFields,
      ...(queryVideoSets ? { query_video_sets: true, collection_version } : {}),
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

// Helper: Convert base64 to ImageData
function base64ToImageData(base64: string, width: number, height: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      resolve(imageData);
    };
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64}`;
  });
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

function isVideoSetQueryResult(result: VectorData | VideoSetResult): result is VideoSetResult {
  return Boolean(result) && typeof result === 'object' && Array.isArray((result as any).videos);
}

function extractScreenVideos(
  screenResults: (VectorData | VideoSetResult)[] | undefined,
  videoTopK: number
): { representatives: VectorData[]; allVideosInOrder: VectorData[] } {
  const parsedSets: { video_set_id?: string | null; representative?: VectorData; videos: VectorData[]; }[] = [];
  const allVideosInOrder: VectorData[] = [];

  if (!screenResults || screenResults.length === 0) {
    return { representatives: [], allVideosInOrder };
  }

  for (const rawResult of screenResults) {
    if (isVideoSetQueryResult(rawResult)) {
      const videosWithSetId = (rawResult.videos || []).map(video =>
        video.video_set_id ? video : { ...video, video_set_id: rawResult.video_set_id }
      );

      allVideosInOrder.push(...videosWithSetId);

      const representative = videosWithSetId.find(video => video.id === rawResult.representative_id);
      if (!representative) {
        console.warn(
          `[VideoSet] Representative "${rawResult.representative_id}" not found in set "${rawResult.video_set_id}"`
        );
      }

      parsedSets.push({
        video_set_id: rawResult.video_set_id,
        representative,
        videos: videosWithSetId,
      });
    } else {
      const vectorResult = rawResult as VectorData;
      allVideosInOrder.push(vectorResult);
      parsedSets.push({
        video_set_id: vectorResult.video_set_id ?? null,
        representative: vectorResult,
        videos: [vectorResult],
      });
    }
  }

  const representatives = parsedSets
    .slice(0, videoTopK)
    .map((set) => {
      if (!set.representative) return undefined;
      const representativeWithSetId = set.representative.video_set_id
        ? { ...set.representative }
        : { ...set.representative, video_set_id: set.video_set_id };

      representativeWithSetId.video_set_videos = set.videos;
      return representativeWithSetId;
    })
    .filter((rep): rep is VectorData => Boolean(rep));

  return { representatives, allVideosInOrder };
}

async function processRetrievedDocument(doc: VectorData): Promise<VectorData> {
  const decryptedContent = await decryptText(doc.content).catch(() => '[Decryption Error]');
  let processedDoc = { ...doc, content: decryptedContent };

  // If this is a screen recording, reconstruct the original video blob
  if (processedDoc.source_type === 'screen' && decryptedContent !== '[Decryption Error]') {
    try {
      const payload = JSON.parse(decryptedContent);

      // New format: original video blob stored as base64
      if (payload.video_base64) {
        const videoBlob = await base64ToVideoBlob(
          payload.video_base64,
          payload.video_type || 'video/webm'
        );
        processedDoc = {
          ...processedDoc,
          video_blob: videoBlob,
          duration: payload.duration,
          width: payload.width,
          height: payload.height,
        };
      }
    } catch (e) {
      console.error('Failed to reconstruct video for doc:', doc.id, e);
    }
  }

  // Recursively process video set items if they exist (RAG Video Set Debugging)
  if (processedDoc.video_set_videos && processedDoc.video_set_videos.length > 0) {
    processedDoc.video_set_videos = await Promise.all(
      processedDoc.video_set_videos.map(v => processRetrievedDocument({ ...v, source_type: 'screen' }))
    );
    
    // Sort videos in set by timestamp/id just in case to ensure correct playback order
    processedDoc.video_set_videos.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.id.localeCompare(b.id);
    });
  }

  return processedDoc;
}

// Complete RAG flow: Search + Query top-K + Decrypt (unified chat + video)
export async function searchAndQuery(
  chatQueryVector: number[],
  chatTopK: number = 7,
  videoQueryVector?: number[], // Optional: separate embedding for video search
  videoTopK: number = 3, // Optional: top-K for video (defaults to 3)
  excludeSessionId?: number, // Optional: exclude memories from this session (to avoid redundancy)
  collection_version: string = 'video_set'
): Promise<VectorData[]> {
  const screenCollectionVersion = collection_version ?? 'video_set';
  const shouldSearchScreens = Boolean(videoQueryVector && videoTopK > 0);

  // Search both collections in parallel with appropriate embeddings
  let searchResult: SearchResponse;

  if (shouldSearchScreens) {
    // Use separate embeddings for chat (768-dim DRAGON) and video (512-dim CLIP)
    searchResult = await apiRequestWithAuth<SearchResponse>('/api/collections/search/', {
      method: 'POST',
      body: JSON.stringify({
        chat_data: [{ vector: chatQueryVector }],
        screen_data: [{ vector: videoQueryVector }],
        collection_version: screenCollectionVersion,
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
  if (shouldSearchScreens && searchResult.ok && searchResult.screen_scores && searchResult.screen_ids &&
      searchResult.screen_scores.length > 0 && searchResult.screen_ids.length > 0) {
    const scores = searchResult.screen_scores[0];
    const ids = searchResult.screen_ids[0];

    const videoSetSize = (import.meta as any).env?.VITE_VIDEO_SET_SIZE
      ? Number((import.meta as any).env.VITE_VIDEO_SET_SIZE)
      : 15;

    // Pair scores with IDs and sort by score (descending)
    screenIds = scores
      .map((score: number, index: number) => ({ score, id: ids[index] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, videoTopK * videoSetSize)
      .map(item => item.id);
  }

  if (chatIds.length === 0 && screenIds.length === 0) return [];

  // Query collections based on what we have (use correct IDs for each collection)
  let queryResult: QueryResponse;
  const outputFields = ['content', 'timestamp', 'session_id', 'role'];

  if (screenIds.length > 0) {
    // Unified query for chat + screen with video set retrieval
    queryResult = await queryScreenData(
      screenIds,
      outputFields,
      screenCollectionVersion,
      chatIds,
      outputFields,
      true
    );
  } else if (chatIds.length > 0) {
    queryResult = await queryChatData(chatIds, outputFields);
  } else {
    queryResult = { ok: false };
  }

  // Combine results and tag with source type
  const { representatives: screenResultsForRag } = extractScreenVideos(
    queryResult.screen_results,
    videoTopK
  );

  const allResults: VectorData[] = [
    ...(queryResult.chat_results || []).map(doc => ({ ...doc, source_type: 'chat' as const })),
    ...screenResultsForRag.map(doc => ({ ...doc, source_type: 'screen' as const }))
  ];

  // Filter out same-session memories
  const filteredResults = excludeSessionId !== undefined
    ? allResults.filter(doc => doc.session_id === 0 || doc.session_id !== excludeSessionId)
    : allResults;

  // Decrypt all results and reconstruct videos for screen recordings
  const decryptedResults = await Promise.all(
    filteredResults.map(doc => processRetrievedDocument(doc))
  )

  return decryptedResults;
}

export const collectionService = {
  insertChatData,
  insertScreenData,
  clearCollections,
  searchChatData,
  queryChatData,
  queryScreenData,
  searchAndQuery,
  getTopKIndices,
};
