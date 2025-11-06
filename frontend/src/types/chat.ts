// Chat session and message types matching backend API

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: number;
  session: number;
  role: MessageRole;
  content: string; // Encrypted in DB, decrypted on client
  timestamp: number; // Epoch ms
  created_at: string; // ISO datetime
}

export interface ChatMessageCreateRequest {
  role: MessageRole;
  content: string; // Must be encrypted
  timestamp: number;
}

export interface ChatSession {
  id: number;
  title: string; // Encrypted in DB, decrypted on client
  created_at: string;
  updated_at: string;
  last_message_timestamp: number | null;
  message_count?: number; // List view only
  messages?: ChatMessage[]; // Detail view only
}

export interface ChatSessionCreateRequest {
  title: string; // Must be encrypted
}

export interface ChatSessionUpdateRequest {
  title: string; // Must be encrypted
}

export interface MessageListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ChatMessage[];
}
