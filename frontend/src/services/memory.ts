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

export const memoryService = {
  trackMessage,
};
