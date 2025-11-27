import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  collectionService,
  insertChatData,
  insertScreenData,
  searchChatData,
  queryChatData,
  queryScreenData,
  queryBothData,
  searchAndQuery,
  getTopKIndices,
  type VectorData,
  type InsertResponse,
  type SearchResponse,
  type QueryResponse,
} from './collection';

// Mock dependencies
vi.mock('@/utils/apiRequest', () => ({
  apiRequestWithAuth: vi.fn(),
}));

vi.mock('@/utils/encryption', () => ({
  decryptText: vi.fn((text: string) => {
    if (text.startsWith('encrypted_')) {
      return Promise.resolve(text.replace('encrypted_', ''));
    }
    return Promise.resolve(text);
  }),
}));

import { apiRequestWithAuth } from '@/utils/apiRequest';

const mockApiRequest = apiRequestWithAuth as ReturnType<typeof vi.fn>;

describe('collectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('insertChatData', () => {
    it('inserts chat vector data', async () => {
      const chatData: VectorData[] = [
        {
          id: 'chat_1',
          vector: new Array(768).fill(0.1),
          content: 'encrypted_test content',
          timestamp: Date.now(),
          session_id: 1,
          role: 'user',
        },
      ];

      const mockResponse: InsertResponse = {
        ok: true,
        result: { chat_insert_count: 1 },
      };

      mockApiRequest.mockResolvedValue(mockResponse);

      const result = await insertChatData(chatData);

      expect(mockApiRequest).toHaveBeenCalledWith('/api/collections/insert/', {
        method: 'POST',
        body: JSON.stringify({ chat_data: chatData }),
      });
      expect(result.ok).toBe(true);
      expect(result.result.chat_insert_count).toBe(1);
    });
  });

  describe('insertScreenData', () => {
    it('inserts screen (video) vector data', async () => {
      const screenData: VectorData[] = [
        {
          id: 'screen_123',
          vector: new Array(512).fill(0.2),
          content: 'encrypted_video_data',
          timestamp: Date.now(),
          session_id: 0,
          role: 'screen_recording',
        },
      ];

      const mockResponse: InsertResponse = {
        ok: true,
        result: { screen_insert_count: 1 },
      };

      mockApiRequest.mockResolvedValue(mockResponse);

      const result = await insertScreenData(screenData);

      expect(mockApiRequest).toHaveBeenCalledWith('/api/collections/insert/', {
        method: 'POST',
        body: JSON.stringify({ screen_data: screenData }),
      });
      expect(result.ok).toBe(true);
      expect(result.result.screen_insert_count).toBe(1);
    });
  });

  describe('searchChatData', () => {
    it('searches chat collection with query vectors', async () => {
      const queryVectors = [new Array(768).fill(0.5)];

      const mockResponse: SearchResponse = {
        ok: true,
        chat_scores: [[0.9, 0.8, 0.7]],
        chat_ids: [['id1', 'id2', 'id3']],
      };

      mockApiRequest.mockResolvedValue(mockResponse);

      const result = await searchChatData(queryVectors);

      expect(mockApiRequest).toHaveBeenCalledWith('/api/collections/search/', {
        method: 'POST',
        body: expect.stringContaining('chat_data'),
      });
      expect(result.ok).toBe(true);
      expect(result.chat_scores).toHaveLength(1);
      expect(result.chat_ids).toHaveLength(1);
    });
  });

  describe('queryChatData', () => {
    it('queries specific chat documents by indices', async () => {
      const indices = ['id1', 'id2'];
      const outputFields = ['content', 'timestamp'];

      const mockResponse: QueryResponse = {
        ok: true,
        chat_results: [
          {
            id: 'id1',
            vector: [],
            content: 'encrypted_content1',
            timestamp: 1000,
            session_id: 1,
            role: 'user',
          },
        ],
      };

      mockApiRequest.mockResolvedValue(mockResponse);

      const result = await queryChatData(indices, outputFields);

      expect(mockApiRequest).toHaveBeenCalledWith('/api/collections/query/', {
        method: 'POST',
        body: JSON.stringify({
          chat_ids: indices,
          chat_output_fields: outputFields,
        }),
      });
      expect(result.ok).toBe(true);
      expect(result.chat_results).toHaveLength(1);
    });

    it('uses default output fields when not specified', async () => {
      const indices = ['id1'];

      mockApiRequest.mockResolvedValue({ ok: true, chat_results: [] });

      await queryChatData(indices);

      expect(mockApiRequest).toHaveBeenCalledWith(
        '/api/collections/query/',
        expect.objectContaining({
          body: expect.stringContaining('content'),
        })
      );
    });
  });

  describe('queryScreenData', () => {
    it('queries specific screen documents by indices', async () => {
      const indices = ['screen_1'];
      const outputFields = ['content', 'duration'];

      const mockResponse: QueryResponse = {
        ok: true,
        screen_results: [
          {
            id: 'screen_1',
            vector: [],
            content: 'encrypted_video',
            timestamp: 2000,
            session_id: 0,
            role: 'screen_recording',
          },
        ],
      };

      mockApiRequest.mockResolvedValue(mockResponse);

      const result = await queryScreenData(indices, outputFields);

      expect(mockApiRequest).toHaveBeenCalledWith('/api/collections/query/', {
        method: 'POST',
        body: JSON.stringify({
          screen_ids: indices,
          screen_output_fields: outputFields,
        }),
      });
      expect(result.ok).toBe(true);
      expect(result.screen_results).toHaveLength(1);
    });
  });

  describe('queryBothData', () => {
    it('queries both chat and screen collections', async () => {
      const indices = ['id1'];
      const outputFields = ['content'];

      const mockResponse: QueryResponse = {
        ok: true,
        chat_results: [],
        screen_results: [],
      };

      mockApiRequest.mockResolvedValue(mockResponse);

      await queryBothData(indices, outputFields);

      const callBody = JSON.parse(mockApiRequest.mock.calls[0][1].body);
      expect(callBody.chat_ids).toEqual(indices);
      expect(callBody.screen_ids).toEqual(indices);
      expect(callBody.chat_output_fields).toEqual(outputFields);
      expect(callBody.screen_output_fields).toEqual(outputFields);
    });
  });

  describe('getTopKIndices', () => {
    it('returns top-K indices sorted by score descending', () => {
      const scores = [0.5, 0.9, 0.3, 0.7, 0.8];
      const k = 3;

      const result = getTopKIndices(scores, k);

      expect(result).toEqual([1, 4, 3]); // indices of scores 0.9, 0.8, 0.7
    });

    it('returns all indices when k exceeds array length', () => {
      const scores = [0.5, 0.9];
      const k = 5;

      const result = getTopKIndices(scores, k);

      expect(result).toEqual([1, 0]);
    });

    it('handles empty scores array', () => {
      const scores: number[] = [];
      const k = 3;

      const result = getTopKIndices(scores, k);

      expect(result).toEqual([]);
    });
  });

  describe('searchAndQuery', () => {
    it('searches and queries chat data only', async () => {
      const chatQueryVector = new Array(768).fill(0.5);

      mockApiRequest
        .mockResolvedValueOnce({
          ok: true,
          chat_scores: [[0.9, 0.8, 0.7]],
          chat_ids: [['id1', 'id2', 'id3']],
        })
        .mockResolvedValueOnce({
          ok: true,
          chat_results: [
            {
              id: 'id1',
              vector: [],
              content: 'encrypted_test content',
              timestamp: 1000,
              session_id: 1,
              role: 'user',
            },
          ],
        });

      const result = await searchAndQuery(chatQueryVector, 2);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('test content');
      expect(result[0].source_type).toBe('chat');
    });

    it('searches both chat and video with separate embeddings', async () => {
      const chatQueryVector = new Array(768).fill(0.5);
      const videoQueryVector = new Array(512).fill(0.3);

      mockApiRequest
        .mockResolvedValueOnce({
          ok: true,
          chat_scores: [[0.9]],
          chat_ids: [['chat1']],
          screen_scores: [[0.8]],
          screen_ids: [['screen1']],
        })
        .mockResolvedValueOnce({
          ok: true,
          chat_results: [
            {
              id: 'chat1',
              vector: [],
              content: 'encrypted_chat',
              timestamp: 1000,
              session_id: 1,
              role: 'user',
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          screen_results: [
            {
              id: 'screen1',
              vector: [],
              content: JSON.stringify({
                video_base64: 'dGVzdA==',
                video_type: 'video/webm',
                duration: 1000,
              }),
              timestamp: 2000,
              session_id: 0,
              role: 'screen_recording',
            },
          ],
        });

      // Mock atob for base64 decoding
      global.atob = vi.fn((str) => 'test');

      const result = await searchAndQuery(chatQueryVector, 1, videoQueryVector, 1);

      expect(result).toHaveLength(2);
      expect(result.some((r) => r.source_type === 'chat')).toBe(true);
      expect(result.some((r) => r.source_type === 'screen')).toBe(true);
    });

    it('filters out same-session memories when excludeSessionId is provided', async () => {
      const chatQueryVector = new Array(768).fill(0.5);

      mockApiRequest
        .mockResolvedValueOnce({
          ok: true,
          chat_scores: [[0.9, 0.8]],
          chat_ids: [['id1', 'id2']],
        })
        .mockResolvedValueOnce({
          ok: true,
          chat_results: [
            {
              id: 'id1',
              vector: [],
              content: 'encrypted_content',
              timestamp: 1000,
              session_id: 1,
              role: 'user',
            },
            {
              id: 'id2',
              vector: [],
              content: 'encrypted_content2',
              timestamp: 2000,
              session_id: 2,
              role: 'user',
            },
          ],
        });

      const result = await searchAndQuery(chatQueryVector, 5, undefined, 3, 1);

      // Should filter out session_id === 1
      expect(result).toHaveLength(1);
      expect(result[0].session_id).toBe(2);
    });

    it('returns empty array when no results found', async () => {
      const chatQueryVector = new Array(768).fill(0.5);

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        chat_scores: [],
        chat_ids: [],
      });

      const result = await searchAndQuery(chatQueryVector);

      expect(result).toEqual([]);
    });

    it('handles decryption errors gracefully', async () => {
      const chatQueryVector = new Array(768).fill(0.5);

      mockApiRequest
        .mockResolvedValueOnce({
          ok: true,
          chat_scores: [[0.9]],
          chat_ids: [['id1']],
        })
        .mockResolvedValueOnce({
          ok: true,
          chat_results: [
            {
              id: 'id1',
              vector: [],
              content: 'invalid_encrypted_content',
              timestamp: 1000,
              session_id: 1,
              role: 'user',
            },
          ],
        });

      const result = await searchAndQuery(chatQueryVector, 1);

      expect(result).toHaveLength(1);
      // Decryption should return the text as-is since it doesn't start with 'encrypted_'
      expect(result[0].content).toBeTruthy();
    });
  });

  describe('collectionService export', () => {
    it('exports all service methods', () => {
      expect(collectionService.insertChatData).toBe(insertChatData);
      expect(collectionService.insertScreenData).toBe(insertScreenData);
      expect(collectionService.searchChatData).toBe(searchChatData);
      expect(collectionService.queryChatData).toBe(queryChatData);
      expect(collectionService.queryScreenData).toBe(queryScreenData);
      expect(collectionService.searchAndQuery).toBe(searchAndQuery);
      expect(collectionService.getTopKIndices).toBe(getTopKIndices);
    });
  });

  describe('searchAndQuery - additional edge cases', () => {
    it('handles empty chat scores array', async () => {
      const chatQueryVector = new Array(768).fill(0.5);

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        chat_scores: [[]],
        chat_ids: [[]],
      });

      const result = await searchAndQuery(chatQueryVector, 3);

      expect(result).toEqual([]);
    });

    it('handles missing chat_scores in response', async () => {
      const chatQueryVector = new Array(768).fill(0.5);

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        chat_ids: [['id1']],
      });

      const result = await searchAndQuery(chatQueryVector, 3);

      expect(result).toEqual([]);
    });

    it('handles video search with empty screen scores', async () => {
      const chatQueryVector = new Array(768).fill(0.5);
      const videoQueryVector = new Array(512).fill(0.3);

      mockApiRequest.mockResolvedValueOnce({
        ok: true,
        chat_scores: [[0.9]],
        chat_ids: [['chat1']],
        screen_scores: [[]],
        screen_ids: [[]],
      }).mockResolvedValueOnce({
        ok: true,
        chat_results: [
          {
            id: 'chat1',
            vector: [],
            content: 'encrypted_test',
            timestamp: 1000,
            session_id: 1,
            role: 'user',
          },
        ],
      });

      const result = await searchAndQuery(chatQueryVector, 1, videoQueryVector, 1);

      expect(result).toHaveLength(1);
      expect(result[0].source_type).toBe('chat');
    });

    it('handles malformed video content JSON', async () => {
      const chatQueryVector = new Array(768).fill(0.5);
      const videoQueryVector = new Array(512).fill(0.3);

      mockApiRequest
        .mockResolvedValueOnce({
          ok: true,
          screen_scores: [[0.8]],
          screen_ids: [['screen1']],
        })
        .mockResolvedValueOnce({
          ok: true,
          screen_results: [
            {
              id: 'screen1',
              vector: [],
              content: 'invalid_json{',
              timestamp: 2000,
              session_id: 0,
              role: 'screen_recording',
            },
          ],
        });

      const result = await searchAndQuery(chatQueryVector, 0, videoQueryVector, 1);

      // Should still return results even with JSON parse errors
      expect(result).toBeDefined();
    });

    it('filters multiple same-session results', async () => {
      const chatQueryVector = new Array(768).fill(0.5);

      mockApiRequest
        .mockResolvedValueOnce({
          ok: true,
          chat_scores: [[0.9, 0.8, 0.7]],
          chat_ids: [['id1', 'id2', 'id3']],
        })
        .mockResolvedValueOnce({
          ok: true,
          chat_results: [
            {
              id: 'id1',
              vector: [],
              content: 'encrypted_content1',
              timestamp: 1000,
              session_id: 5,
              role: 'user',
            },
            {
              id: 'id2',
              vector: [],
              content: 'encrypted_content2',
              timestamp: 2000,
              session_id: 5,
              role: 'user',
            },
            {
              id: 'id3',
              vector: [],
              content: 'encrypted_content3',
              timestamp: 3000,
              session_id: 10,
              role: 'user',
            },
          ],
        });

      const result = await searchAndQuery(chatQueryVector, 5, undefined, 3, 5);

      // Should filter out all session_id === 5
      expect(result).toHaveLength(1);
      expect(result[0].session_id).toBe(10);
    });
  });

  describe('getTopKIndices - edge cases', () => {
    it('returns empty array for k=0', () => {
      const scores = [0.9, 0.8, 0.7];
      const result = getTopKIndices(scores, 0);
      expect(result).toEqual([]);
    });

    it('handles single element array', () => {
      const scores = [0.5];
      const result = getTopKIndices(scores, 3);
      expect(result).toEqual([0]);
    });

    it('handles negative scores correctly', () => {
      const scores = [-0.5, 0.9, -0.3, 0.7];
      const result = getTopKIndices(scores, 2);
      expect(result).toEqual([1, 3]); // indices of 0.9 and 0.7
    });
  });
});
