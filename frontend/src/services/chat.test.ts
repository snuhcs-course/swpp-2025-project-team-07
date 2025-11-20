import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  chatService,
  fetchSessions,
  createSession,
  fetchSession,
  fetchMessages,
  sendMessage,
  updateSession,
  updateMessage,
  deleteSession,
  deleteMessage,
} from './chat';
import type { ChatSession, ChatMessage } from '@/types/chat';

// Mock dependencies
vi.mock('@/utils/apiRequest', () => ({
  apiRequestWithAuth: vi.fn(),
}));

vi.mock('@/utils/encryption', () => ({
  encryptText: vi.fn((text: string) => Promise.resolve(`encrypted_${text}`)),
  decryptText: vi.fn((text: string) => {
    if (text.startsWith('encrypted_')) {
      return Promise.resolve(text.replace('encrypted_', ''));
    }
    throw new Error('Invalid encrypted text');
  }),
}));

import { apiRequestWithAuth } from '@/utils/apiRequest';

const mockApiRequest = apiRequestWithAuth as ReturnType<typeof vi.fn>;

describe('chatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchSessions', () => {
    it('fetches and decrypts all sessions', async () => {
      const mockSessions: ChatSession[] = [
        {
          id: 1,
          title: 'encrypted_Session 1',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          messages: [],
        },
        {
          id: 2,
          title: 'encrypted_Session 2',
          created_at: '2024-01-02',
          updated_at: '2024-01-02',
          messages: [],
        },
      ];

      mockApiRequest.mockResolvedValue(mockSessions);

      const result = await fetchSessions();

      expect(mockApiRequest).toHaveBeenCalledWith('/api/chat/sessions/', {
        method: 'GET',
      });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Session 1');
      expect(result[1].title).toBe('Session 2');
    });

    it('handles decryption errors gracefully', async () => {
      const mockSessions: ChatSession[] = [
        {
          id: 1,
          title: 'invalid_encrypted_text',
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          messages: [],
        },
      ];

      mockApiRequest.mockResolvedValue(mockSessions);

      const result = await fetchSessions();

      expect(result[0].title).toBe('[Decryption Error]');
    });
  });

  describe('createSession', () => {
    it('encrypts title and creates session', async () => {
      const mockSession: ChatSession = {
        id: 3,
        title: 'encrypted_New Session',
        created_at: '2024-01-03',
        updated_at: '2024-01-03',
        messages: [],
      };

      mockApiRequest.mockResolvedValue(mockSession);

      const result = await createSession('New Session');

      expect(mockApiRequest).toHaveBeenCalledWith('/api/chat/sessions/create/', {
        method: 'POST',
        body: JSON.stringify({ title: 'encrypted_New Session' }),
      });
      expect(result.title).toBe('New Session');
    });
  });

  describe('fetchSession', () => {
    it('fetches and decrypts session with messages', async () => {
      const mockSession: ChatSession = {
        id: 1,
        title: 'encrypted_Test Session',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        messages: [
          {
            id: 1,
            session: 1,
            role: 'user',
            content: 'encrypted_Hello',
            timestamp: '2024-01-01T10:00:00Z',
          },
          {
            id: 2,
            session: 1,
            role: 'assistant',
            content: 'encrypted_Hi there!',
            timestamp: '2024-01-01T10:00:01Z',
          },
        ],
      };

      mockApiRequest.mockResolvedValue(mockSession);

      const result = await fetchSession(1);

      expect(mockApiRequest).toHaveBeenCalledWith('/api/chat/sessions/1/', {
        method: 'GET',
      });
      expect(result.title).toBe('Test Session');
      expect(result.messages).toHaveLength(2);
      expect(result.messages![0].content).toBe('Hello');
      expect(result.messages![1].content).toBe('Hi there!');
    });

    it('handles session without messages', async () => {
      const mockSession: ChatSession = {
        id: 1,
        title: 'encrypted_No Messages',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      mockApiRequest.mockResolvedValue(mockSession);

      const result = await fetchSession(1);

      expect(result.title).toBe('No Messages');
      expect(result.messages).toBeUndefined();
    });
  });

  describe('fetchMessages', () => {
    it('fetches messages with default page size', async () => {
      const mockMessages: ChatMessage[] = [
        {
          id: 1,
          session: 1,
          role: 'user',
          content: 'encrypted_Test message',
          timestamp: '2024-01-01T10:00:00Z',
        },
      ];

      mockApiRequest.mockResolvedValue(mockMessages);

      const result = await fetchMessages(1);

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/chat/sessions/1/messages/?page_size=0',
        { method: 'GET' }
      );
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Test message');
    });

    it('fetches messages with custom page size', async () => {
      const mockResponse = {
        results: [
          {
            id: 1,
            session: 1,
            role: 'user',
            content: 'encrypted_Paginated message',
            timestamp: '2024-01-01T10:00:00Z',
          },
        ],
        count: 1,
        next: null,
        previous: null,
      };

      mockApiRequest.mockResolvedValue(mockResponse);

      const result = await fetchMessages(1, 20);

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/chat/sessions/1/messages/?page_size=20',
        { method: 'GET' }
      );
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Paginated message');
    });
  });

  describe('sendMessage', () => {
    it('encrypts and sends user message', async () => {
      const mockMessage: ChatMessage = {
        id: 5,
        session: 1,
        role: 'user',
        content: 'encrypted_Test content',
        timestamp: '2024-01-01T10:00:00Z',
      };

      mockApiRequest.mockResolvedValue(mockMessage);

      const result = await sendMessage(1, 'user', 'Test content');

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/chat/sessions/1/messages/create/',
        {
          method: 'POST',
          body: expect.stringContaining('encrypted_Test content'),
        }
      );
      expect(result.content).toBe('Test content');
      expect(result.role).toBe('user');
    });

    it('sends assistant message', async () => {
      const mockMessage: ChatMessage = {
        id: 6,
        session: 1,
        role: 'assistant',
        content: 'encrypted_Response',
        timestamp: '2024-01-01T10:00:01Z',
      };

      mockApiRequest.mockResolvedValue(mockMessage);

      const result = await sendMessage(1, 'assistant', 'Response');

      expect(result.role).toBe('assistant');
    });
  });

  describe('updateSession', () => {
    it('encrypts and updates session title', async () => {
      const mockSession: ChatSession = {
        id: 1,
        title: 'encrypted_Updated Title',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        messages: [],
      };

      mockApiRequest.mockResolvedValue(mockSession);

      const result = await updateSession(1, 'Updated Title');

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/chat/sessions/1/update/',
        {
          method: 'PATCH',
          body: JSON.stringify({ title: 'encrypted_Updated Title' }),
        }
      );
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('updateMessage', () => {
    it('encrypts and updates message content', async () => {
      const mockMessage: ChatMessage = {
        id: 1,
        session: 1,
        role: 'user',
        content: 'encrypted_Edited content',
        timestamp: '2024-01-01T10:00:00Z',
      };

      mockApiRequest.mockResolvedValue(mockMessage);

      const result = await updateMessage(1, 'Edited content');

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/chat/messages/1/update/',
        {
          method: 'PATCH',
          body: JSON.stringify({ content: 'encrypted_Edited content' }),
        }
      );
      expect(result.content).toBe('Edited content');
    });
  });

  describe('deleteSession', () => {
    it('deletes session successfully', async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await deleteSession(1);

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/chat/sessions/1/delete/',
        { method: 'DELETE' }
      );
    });
  });

  describe('deleteMessage', () => {
    it('deletes message successfully', async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await deleteMessage(1);

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/chat/messages/1/delete/',
        { method: 'DELETE' }
      );
    });
  });

  describe('chatService export', () => {
    it('exports all service methods', () => {
      expect(chatService.fetchSessions).toBe(fetchSessions);
      expect(chatService.createSession).toBe(createSession);
      expect(chatService.fetchSession).toBe(fetchSession);
      expect(chatService.fetchMessages).toBe(fetchMessages);
      expect(chatService.sendMessage).toBe(sendMessage);
      expect(chatService.updateSession).toBe(updateSession);
      expect(chatService.updateMessage).toBe(updateMessage);
      expect(chatService.deleteSession).toBe(deleteSession);
      expect(chatService.deleteMessage).toBe(deleteMessage);
    });
  });
});
