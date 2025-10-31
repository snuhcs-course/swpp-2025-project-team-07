// Memory management - bundles messages and extracts embeddings for vectorDB

import { embeddingService } from './embedding';
import { collectionService, type VectorData } from './collection';
import { encryptText } from '@/utils/encryption';
import type { ChatMessage } from '@/types/chat';

const BUNDLE_SIZE = 2; // Trigger bundling every 2 messages

interface SessionMemoryState {
  sessionId: number;
  messageCount: number;
}

const sessionStates = new Map<number, SessionMemoryState>();

function getSessionState(sessionId: number): SessionMemoryState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      sessionId,
      messageCount: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

async function extractEmbedding(content: string): Promise<number[]> {
  try {
    return await embeddingService.embedContext(content);
  } catch (error) {
    console.error('Failed to extract embedding:', error);
    throw error;
  }
}

// Combines 2 messages (user + assistant) into 1 vector entry
async function bundleAndStore(sessionId: number, messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;

  try {
    console.log(`[Memory] Bundling ${messages.length} messages for session ${sessionId}`);

    // Combine: "User: question\n\nAssistant: answer"
    const combinedContent = messages
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const embedding = await extractEmbedding(combinedContent);
    const encryptedContent = await encryptText(combinedContent);
    const timestamps = messages.map(m => m.timestamp);
    const messageIds = messages.map(m => m.id);

    const vectorData: VectorData = {
      id: messageIds[0].toString(), // Unique ID (primary key)
      vector: embedding,
      content: encryptedContent,
      timestamp: Math.max(...timestamps),
      session_id: sessionId,
      role: 'conversation', // Indicates combined user+assistant
      message_ids: messageIds,
    };

    await collectionService.insertChatData([vectorData]);
    console.log(`[Memory] Successfully stored 1 combined embedding from ${messages.length} messages`);
  } catch (error) {
    console.error('[Memory] Failed to bundle and store messages:', error);
  }
}

// Tracks messages and triggers bundling when threshold reached
export async function trackMessage(
  sessionId: number,
  allMessages: ChatMessage[]
): Promise<void> {
  const state = getSessionState(sessionId);
  state.messageCount++;

  console.log(
    `[Memory] Session ${sessionId}: ${state.messageCount} messages (bundle at ${BUNDLE_SIZE})`
  );

  if (state.messageCount >= BUNDLE_SIZE) {
    const messagesToBundle = allMessages.slice(-BUNDLE_SIZE);
    bundleAndStore(sessionId, messagesToBundle).catch((error) => {
      console.error('[Memory] Background bundling failed:', error);
    });
    state.messageCount = 0;
  }
}

// Helper: Convert ImageData to base64
async function imageDataToBase64(imageData: ImageData): Promise<string> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(',')[1] || base64;
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper: Convert video Blob to base64
async function videoBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(',')[1] || base64;
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Store video recording embedding + ORIGINAL VIDEO BLOB (no bundling needed)
// Videos are stored globally and available to all sessions
export async function storeVideoEmbedding(
  embedding: Float32Array | number[],
  videoBlob: Blob,
  metadata: { duration: number; width?: number; height?: number }
): Promise<void> {
  try {
    console.log(`[Memory] Storing video embedding, size: ${(videoBlob.size / 1024).toFixed(1)} KB`);

    // Convert original video blob to base64
    const videoBase64 = await videoBlobToBase64(videoBlob);

    // Create payload with original video and metadata
    const payload = {
      video_base64: videoBase64,
      video_type: videoBlob.type,
      video_size: videoBlob.size,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
    };

    const payloadStr = JSON.stringify(payload);
    const encryptedPayload = await encryptText(payloadStr);
    const timestamp = Date.now();

    const vectorData: VectorData = {
      id: `screen_${timestamp}`,
      vector: Array.from(embedding),
      content: encryptedPayload,
      timestamp,
      session_id: 0, // Global storage, available to all sessions
      role: 'screen_recording',
    };

    await collectionService.insertScreenData([vectorData]);
    console.log(`[Memory] Successfully stored video embedding with original video (${(videoBlob.size / 1024).toFixed(1)} KB)`);
  } catch (error) {
    console.error('[Memory] Failed to store video embedding:', error);
    throw error;
  }
}

export const memoryService = {
  trackMessage,
  storeVideoEmbedding,
};
