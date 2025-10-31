// Chat API service - auto encrypts/decrypts data

import { apiRequestWithAuth } from '@/utils/apiRequest';
import { encryptText, decryptText } from '@/utils/encryption';
import type {
  ChatSession,
  ChatMessage,
  MessageListResponse,
} from '@/types/chat';

async function decryptSession(session: ChatSession): Promise<ChatSession> {
  try {
    const decryptedTitle = await decryptText(session.title);
    return { ...session, title: decryptedTitle };
  } catch (error) {
    console.error('Failed to decrypt session title:', error);
    return { ...session, title: '[Decryption Error]' };
  }
}

async function decryptMessage(message: ChatMessage): Promise<ChatMessage> {
  try {
    const decryptedContent = await decryptText(message.content);
    return { ...message, content: decryptedContent };
  } catch (error) {
    console.error('Failed to decrypt message content:', error);
    return { ...message, content: '[Decryption Error]' };
  }
}

export async function fetchSessions(): Promise<ChatSession[]> {
  const sessions = await apiRequestWithAuth<ChatSession[]>('/api/chat/sessions/', {
    method: 'GET',
  });

  return Promise.all(sessions.map(decryptSession));
}

export async function createSession(title: string): Promise<ChatSession> {
  const encryptedTitle = await encryptText(title);
  const session = await apiRequestWithAuth<ChatSession>('/api/chat/sessions/create/', {
    method: 'POST',
    body: JSON.stringify({ title: encryptedTitle }),
  });
  return decryptSession(session);
}

export async function fetchSession(sessionId: number): Promise<ChatSession> {
  const session = await apiRequestWithAuth<ChatSession>(`/api/chat/sessions/${sessionId}/`, {
    method: 'GET',
  });
  const decryptedSession = await decryptSession(session);
  if (decryptedSession.messages) {
    decryptedSession.messages = await Promise.all(decryptedSession.messages.map(decryptMessage));
  }
  return decryptedSession;
}

export async function fetchMessages(
  sessionId: number,
  pageSize: number = 0
): Promise<ChatMessage[]> {
  const url = pageSize === 0
    ? `/api/chat/sessions/${sessionId}/messages/?page_size=0`
    : `/api/chat/sessions/${sessionId}/messages/?page_size=${pageSize}`;

  const response = await apiRequestWithAuth<ChatMessage[] | MessageListResponse>(url, {
    method: 'GET',
  });
  const messages = Array.isArray(response) ? response : response.results;
  return Promise.all(messages.map(decryptMessage));
}

export async function sendMessage(
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<ChatMessage> {
  const encryptedContent = await encryptText(content);
  const message = await apiRequestWithAuth<ChatMessage>(
    `/api/chat/sessions/${sessionId}/messages/create/`,
    {
      method: 'POST',
      body: JSON.stringify({
        role,
        content: encryptedContent,
        timestamp: Date.now(),
      }),
    }
  );
  return decryptMessage(message);
}

export async function updateSession(sessionId: number, title: string): Promise<ChatSession> {
  const encryptedTitle = await encryptText(title);
  const session = await apiRequestWithAuth<ChatSession>(
    `/api/chat/sessions/${sessionId}/update/`,
    {
      method: 'PATCH',
      body: JSON.stringify({ title: encryptedTitle }),
    }
  );
  return decryptSession(session);
}

export async function updateMessage(messageId: number, content: string): Promise<ChatMessage> {
  const encryptedContent = await encryptText(content);
  const message = await apiRequestWithAuth<ChatMessage>(`/api/chat/messages/${messageId}/update/`, {
    method: 'PATCH',
    body: JSON.stringify({ content: encryptedContent }),
  });
  return decryptMessage(message);
}

export async function deleteSession(sessionId: number): Promise<void> {
  await apiRequestWithAuth<void>(`/api/chat/sessions/${sessionId}/delete/`, {
    method: 'DELETE',
  });
}

export async function deleteMessage(messageId: number): Promise<void> {
  await apiRequestWithAuth<void>(`/api/chat/messages/${messageId}/delete/`, {
    method: 'DELETE',
  });
}

export const chatService = {
  fetchSessions,
  createSession,
  fetchSession,
  fetchMessages,
  sendMessage,
  updateSession,
  updateMessage,
  deleteSession,
  deleteMessage,
};
