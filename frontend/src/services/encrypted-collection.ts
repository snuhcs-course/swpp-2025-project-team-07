// encrypted-collection.ts
// Encrypted VectorDB service using native EVDClient (chat + screen)

const evdBinding = require('@/encryption/evd/build/Release/evd_node.node');
const { EVDClient, getTopKIndices: evdGetTopKIndices } = evdBinding;

// Read EVD address from VITE_API_BASE_URL
// Example: VITE_API_BASE_URL=http://43.202.157.112:8000
const BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

function parseHostPort(url: string): { host: string; port: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parsed.port || '8000' };
  } catch {
    return { host: '127.0.0.1', port: '8000' };
  }
}

const { host: EVD_HOST, port: EVD_PORT } = parseHostPort(BASE_URL);

// Collection names
const CHAT_COLLECTION = 'chat_collection';
const SCREEN_COLLECTION = 'screen_collection';

// Embedding dimensions
const CHAT_DIMENSION = 768;   // DRAGON
const SCREEN_DIMENSION = 512; // CLIP

// Metric type
const CHAT_METRIC = 'IP';
const SCREEN_METRIC = 'COSINE';

// Query encrypted by default
const IS_QUERY_ENCRYPT = true;

// For screen retrieve batching
const SCREEN_QUERY_BATCH_SIZE = 3;

export interface VectorData {
  id: string;
  vector: number[];
  content: string;
  timestamp: number;
  session_id: number;
  role: string;
  message_ids?: number[];
  source_type?: 'chat' | 'screen';
  video_blob?: Blob;
  duration?: number;
  frame_count?: number;
  [key: string]: any;
}

export interface InsertResponse {
  ok: boolean;
  result: {
    chat_insert_count?: number;
    screen_insert_count?: number;
  };
}

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

let evdClientInstance: InstanceType<typeof EVDClient> | null = null;

function getEvdClient() {
  if (!evdClientInstance) {
    evdClientInstance = new EVDClient(EVD_HOST, EVD_PORT);

    evdClientInstance.setupCollection(
      CHAT_COLLECTION,
      CHAT_DIMENSION,
      CHAT_METRIC,
      IS_QUERY_ENCRYPT,
    );

    evdClientInstance.setupCollection(
      SCREEN_COLLECTION,
      SCREEN_DIMENSION,
      SCREEN_METRIC,
      IS_QUERY_ENCRYPT,
    );
  }
  return evdClientInstance;
}

export function terminateEvdClient() {
  if (evdClientInstance) {
    try {
      evdClientInstance.terminate();
    } catch {}
    evdClientInstance = null;
  }
}

function toPayload(doc: VectorData): string {
  const { vector, video_blob, ...rest } = doc;
  return JSON.stringify(rest);
}

export async function insertChatData(chatData: VectorData[]): Promise<InsertResponse> {
  if (!chatData.length) return { ok: true, result: { chat_insert_count: 0 } };

  const client = getEvdClient();
  client.insert(
    CHAT_COLLECTION,
    chatData.map(d => d.vector),
    chatData.map(d => toPayload(d))
  );

  return { ok: true, result: { chat_insert_count: chatData.length } };
}

export async function insertScreenData(screenData: VectorData[]): Promise<InsertResponse> {
  if (!screenData.length) return { ok: true, result: { screen_insert_count: 0 } };

  const client = getEvdClient();
  client.insert(
    SCREEN_COLLECTION,
    screenData.map(d => d.vector),
    screenData.map(d => toPayload(d))
  );

  return { ok: true, result: { screen_insert_count: screenData.length } };
}

export async function searchChatData(queryVectors: number[][]): Promise<SearchResponse> {
  const client = getEvdClient();
  const chat_scores: number[][] = [];
  const chat_ids: string[][] = [];

  for (const q of queryVectors) {
    const scores = client.query(CHAT_COLLECTION, q);
    chat_scores.push(scores);
    chat_ids.push(scores.map((_, i) => String(i)));
  }

  return { ok: true, chat_scores, chat_ids };
}

function parsePayload(payload: string, fallbackId: string): VectorData {
  try {
    const parsed = JSON.parse(payload);
    return {
      id: parsed.id ?? fallbackId,
      content: parsed.content ?? '',
      timestamp: parsed.timestamp ?? 0,
      session_id: parsed.session_id ?? 0,
      role: parsed.role ?? 'conversation',
      vector: parsed.vector ?? [],
      ...parsed,
    };
  } catch {
    return {
      id: fallbackId,
      content: payload,
      timestamp: 0,
      session_id: 0,
      role: 'conversation',
      vector: [],
    };
  }
}

export async function queryChatData(indices: string[]): Promise<QueryResponse> {
  const client = getEvdClient();
  return {
    ok: true,
    chat_results: indices.map(id => {
      const payload = client.retrieve(CHAT_COLLECTION, Number(id));
      const doc = parsePayload(payload, id);
      return { ...doc, source_type: 'chat' as const };
    }),
  };
}

export async function queryScreenData(indices: string[]): Promise<QueryResponse> {
  const client = getEvdClient();
  return {
    ok: true,
    screen_results: indices.map(id => {
      const payload = client.retrieve(SCREEN_COLLECTION, Number(id));
      const doc = parsePayload(payload, id);
      return { ...doc, source_type: 'screen' as const };
    }),
  };
}

export async function queryBothData(indices: string[]): Promise<QueryResponse> {
  const [chat, screen] = await Promise.all([
    queryChatData(indices),
    queryScreenData(indices),
  ]);
  return {
    ok: chat.ok && screen.ok,
    chat_results: chat.chat_results,
    screen_results: screen.screen_results,
  };
}

export function getTopKIndices(scores: number[], k: number): number[] {
  if (!scores.length || k <= 0) return [];
  const kk = BigInt(Math.min(k, scores.length));
  return evdGetTopKIndices(scores, kk).map(b => Number(b));
}

export async function searchAndQuery(
  chatQueryVector: number[],
  chatTopK: number = 7,
  videoQueryVector?: number[],
  videoTopK: number = 3,
  excludeSessionId?: number,
): Promise<VectorData[]> {
  const client = getEvdClient();

  let chatIdx: number[] = [];
  let screenIdx: number[] = [];

  if (chatQueryVector?.length) {
    const scores = client.query(CHAT_COLLECTION, chatQueryVector);
    chatIdx = getTopKIndices(scores, chatTopK);
  }

  if (videoQueryVector?.length) {
    const scores = client.query(SCREEN_COLLECTION, videoQueryVector);
    screenIdx = getTopKIndices(scores, videoTopK);
  }

  if (!chatIdx.length && !screenIdx.length) return [];

  const chatIds = chatIdx.map(String);
  const screenIds = screenIdx.map(String);

  const fetchChat = async () =>
    chatIds.length ? (await queryChatData(chatIds)).chat_results ?? [] : [];

  const fetchScreen = async () => {
    if (!screenIds.length) return [];
    const results: VectorData[] = [];
    for (let i = 0; i < screenIds.length; i += SCREEN_QUERY_BATCH_SIZE) {
      const chunk = screenIds.slice(i, i + SCREEN_QUERY_BATCH_SIZE);
      const res = await queryScreenData(chunk);
      if (res.screen_results) results.push(...res.screen_results);
    }
    return results;
  };

  const [chatResults, screenResults] = await Promise.all([fetchChat(), fetchScreen()]);
  const combined = [...chatResults, ...screenResults];

  return excludeSessionId !== undefined
    ? combined.filter(doc => doc.session_id === 0 || doc.session_id !== excludeSessionId)
    : combined;
}

export const collectionService = {
  insertChatData,
  insertScreenData,
  searchAndQuery,
};
