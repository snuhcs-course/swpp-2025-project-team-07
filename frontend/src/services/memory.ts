// Memory management - bundles messages and extracts embeddings for vectorDB

import { embeddingService } from './embedding';
import { encryptText } from '@/utils/encryption';
import type { ChatMessage } from '@/types/chat';
import type { VectorData } from './collection';
import { loadCollection } from './collection-loader';
const { collectionService } = await loadCollection();

// Configuration
const STORE_ASSISTANT_MESSAGES = true; // Set to true to include assistant responses in memory
const SLIDING_WINDOW_SIZE = 3; // Number of messages to include in each bundle

async function extractEmbedding(content: string): Promise<number[]> {
  try {
    return await embeddingService.embedContext(content);
  } catch (error) {
    console.error('Failed to extract embedding:', error);
    throw error;
  }
}

// Bundles last N messages using sliding window and stores as 1 vector entry
async function bundleAndStore(sessionId: number, userMessages: ChatMessage[], assistantMessages: ChatMessage[]): Promise<void> {
  if (userMessages.length === 0) return;

  try {
    const totalMessages = userMessages.length + (STORE_ASSISTANT_MESSAGES ? assistantMessages.length : 0);
    console.log(`[Memory] Bundling last ${userMessages.length} user messages${STORE_ASSISTANT_MESSAGES ? ` + ${assistantMessages.length} assistant messages` : ''} for session ${sessionId}`);

    // Combine messages based on configuration
    let combinedContent: string;
    let allMessages: ChatMessage[];

    if (STORE_ASSISTANT_MESSAGES && assistantMessages.length > 0) {
      // Interleave user and assistant messages in chronological order
      allMessages = [...userMessages, ...assistantMessages].sort((a, b) => a.timestamp - b.timestamp);
      combinedContent = allMessages
        .map((msg) => `${msg.role === 'user' ? 'user' : 'assistant'}: ${msg.content}`)
        .join('\n');
    } else {
      // Only user messages
      allMessages = userMessages;
      combinedContent = userMessages
        .map((msg) => `user: ${msg.content}`)
        .join('\n\n');
    }

    const embedding = await extractEmbedding(combinedContent);
    const encryptedContent = await encryptText(combinedContent);
    const timestamps = allMessages.map(m => m.timestamp);
    const messageIds = allMessages.map(m => m.id);

    const vectorData: VectorData = {
      id: `${messageIds[messageIds.length - 1]}`, // Unique ID with timestamp to avoid collisions
      vector: embedding,
      content: encryptedContent,
      timestamp: Math.max(...timestamps),
      session_id: sessionId,
      role: STORE_ASSISTANT_MESSAGES ? 'conversation' : 'user', // Indicates type of content
      message_ids: messageIds,
    };

    await collectionService.insertChatData([vectorData]);
    console.log(`[Memory] Successfully stored 1 embedding from ${totalMessages} messages`);
  } catch (error) {
    console.error('[Memory] Failed to bundle and store messages:', error);
  }
}

// Tracks messages and triggers bundling with sliding window on every message
export async function trackMessage(
  sessionId: number,
  allMessages: ChatMessage[]
): Promise<void> {
  if (allMessages.length === 0) return;

  console.log(`[Memory] Session ${sessionId}: Total ${allMessages.length} messages, extracting sliding window`);

  // Separate user and assistant messages
  const userMessages = allMessages.filter(m => m.role === 'user');
  const assistantMessages = allMessages.filter(m => m.role === 'assistant');

  // Get last N messages for sliding window
  const lastNUserMessages = userMessages.slice(-SLIDING_WINDOW_SIZE);
  const lastNAssistantMessages = STORE_ASSISTANT_MESSAGES
    ? assistantMessages.slice(-SLIDING_WINDOW_SIZE)
    : [];

  console.log(
    `[Memory] Sliding window: ${lastNUserMessages.length} user messages${STORE_ASSISTANT_MESSAGES ? `, ${lastNAssistantMessages.length} assistant messages` : ''}`
  );

  // Bundle and store (runs in background)
  bundleAndStore(sessionId, lastNUserMessages, lastNAssistantMessages).catch((error) => {
    console.error('[Memory] Background bundling failed:', error);
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
