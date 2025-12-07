import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { memoryService, trackMessage, storeVideoEmbedding } from './memory';
import type { ChatMessage } from '@/types/chat';

// Mock dependencies
vi.mock('./embedding', () => ({
  embeddingService: {
    embedContext: vi.fn((text: string) => Promise.resolve(new Array(768).fill(0.1))),
  },
}));

vi.mock('./collection', () => ({
  collectionService: {
    insertChatData: vi.fn(),
    insertScreenData: vi.fn(),
  },
}));

vi.mock('@/utils/encryption', () => ({
  encryptText: vi.fn((text: string) => Promise.resolve(`encrypted_${text}`)),
}));

import { embeddingService } from './embedding';
import { collectionService } from './collection';
import { encryptText } from '@/utils/encryption';

const mockEmbedContext = embeddingService.embedContext as ReturnType<typeof vi.fn>;
const mockInsertChatData = collectionService.insertChatData as ReturnType<typeof vi.fn>;
const mockInsertScreenData = collectionService.insertScreenData as ReturnType<typeof vi.fn>;
const mockEncryptText = encryptText as ReturnType<typeof vi.fn>;

describe('memoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('trackMessage', () => {
    it('bundles and stores sliding window of user messages', async () => {
      const messages: ChatMessage[] = [
        {
          id: 1,
          session: 1,
          role: 'user',
          content: 'Message 1',
          timestamp: 1000,
        },
        {
          id: 2,
          session: 1,
          role: 'user',
          content: 'Message 2',
          timestamp: 2000,
        },
        {
          id: 3,
          session: 1,
          role: 'user',
          content: 'Message 3',
          timestamp: 3000,
        },
        {
          id: 4,
          session: 1,
          role: 'user',
          content: 'Message 4',
          timestamp: 4000,
        },
      ];

      await trackMessage(1, messages);

      // Wait for async bundling to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockEmbedContext).toHaveBeenCalled();
      expect(mockEncryptText).toHaveBeenCalled();
      expect(mockInsertChatData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            session_id: 1,
            role: expect.any(String),
          }),
        ])
      );
    });

    it('handles mixed user and assistant messages', async () => {
      const messages: ChatMessage[] = [
        {
          id: 1,
          session: 1,
          role: 'user',
          content: 'User message 1',
          timestamp: 1000,
        },
        {
          id: 2,
          session: 1,
          role: 'assistant',
          content: 'Assistant response 1',
          timestamp: 2000,
        },
        {
          id: 3,
          session: 1,
          role: 'user',
          content: 'User message 2',
          timestamp: 3000,
        },
      ];

      await trackMessage(1, messages);

      // Wait for async bundling
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockEmbedContext).toHaveBeenCalled();
      expect(mockInsertChatData).toHaveBeenCalled();
    });

    it('handles empty message list', async () => {
      await trackMessage(1, []);

      expect(mockEmbedContext).not.toHaveBeenCalled();
      expect(mockInsertChatData).not.toHaveBeenCalled();
    });

    it('only processes last N messages in sliding window', async () => {
      const messages: ChatMessage[] = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        session: 1,
        role: 'user' as const,
        content: `Message ${i + 1}`,
        timestamp: (i + 1) * 1000,
      }));

      await trackMessage(1, messages);

      // Wait for async bundling
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should embed content from sliding window
      expect(mockEmbedContext).toHaveBeenCalled();
      const embedCall = mockEmbedContext.mock.calls[0][0];
      // Should contain last 3 messages
      expect(embedCall).toContain('Message 8');
      expect(embedCall).toContain('Message 9');
      expect(embedCall).toContain('Message 10');
    });

    it('handles embedding extraction errors gracefully', async () => {
      mockEmbedContext.mockRejectedValueOnce(new Error('Embedding failed'));

      const messages: ChatMessage[] = [
        {
          id: 1,
          session: 1,
          role: 'user',
          content: 'Test message',
          timestamp: 1000,
        },
      ];

      await trackMessage(1, messages);

      // Wait for async bundling
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(console.error).toHaveBeenCalled();
    });

    it('handles database insertion errors during bundling', async () => {
      // Make insertChatData fail to test error handling in bundleAndStore
      mockInsertChatData.mockRejectedValueOnce(new Error('Database connection failed'));

      const messages: ChatMessage[] = [
        {
          id: 1,
          session: 1,
          role: 'user',
          content: 'Test message',
          timestamp: 1000,
        },
      ];

      await trackMessage(1, messages);

      // Wait for async bundling and error handling
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should log error from bundleAndStore's catch block
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[Memory] Failed to bundle and store messages:'),
        expect.any(Error)
      );
    });

    it('bundles both user and assistant messages when configured to store assistants', async () => {
      const messages: ChatMessage[] = [
        {
          id: 1,
          session: 1,
          role: 'user',
          content: 'User message',
          timestamp: 1000,
        },
        {
          id: 2,
          session: 1,
          role: 'assistant',
          content: 'Assistant message',
          timestamp: 2000,
        },
      ];

      await trackMessage(1, messages);

      // Wait for async bundling
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockEmbedContext).toHaveBeenCalled();
      const embedCall = mockEmbedContext.mock.calls[0][0];
      // Should contain both user and assistant content
      expect(embedCall).toContain('User message');
      expect(embedCall).toContain('Assistant message');
    });
  });

  describe('storeVideoEmbedding', () => {
    it('stores video embedding with blob metadata', async () => {
      const mockEmbedding = new Float32Array(512).fill(0.5);
      const mockBlob = new Blob(['fake video data'], { type: 'video/webm' });
      const metadata = {
        duration: 5000,
        width: 1920,
        height: 1080,
      };

      // Mock FileReader
      const mockFn = vi.fn();
      mockFn.prototype = {
        readAsDataURL: vi.fn(function(this: any) {
          setTimeout(() => {
            this.result = 'data:video/webm;base64,ZmFrZSB2aWRlbyBkYXRh';
            if (this.onloadend) this.onloadend();
          }, 0);
        }),
      };
      global.FileReader = mockFn as any;

      await storeVideoEmbedding(mockEmbedding, mockBlob, metadata);

      expect(mockInsertScreenData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringContaining('screen_'),
            vector: expect.any(Array),
            session_id: 0,
            role: 'screen_recording',
          }),
        ]),
        'video_set'
      );
    });

    it('handles embedding as regular array', async () => {
      const mockEmbedding = new Array(512).fill(0.5);
      const mockBlob = new Blob(['test'], { type: 'video/mp4' });
      const metadata = { duration: 1000 };

      const mockFn = vi.fn();
      mockFn.prototype = {
        readAsDataURL: vi.fn(function(this: any) {
          setTimeout(() => {
            this.result = 'data:video/mp4;base64,dGVzdA==';
            if (this.onloadend) this.onloadend();
          }, 0);
        }),
      };
      global.FileReader = mockFn as any;

      await storeVideoEmbedding(mockEmbedding, mockBlob, metadata);

      expect(mockInsertScreenData).toHaveBeenCalled();
    });

    it('handles FileReader error', async () => {
      const mockEmbedding = new Float32Array(512).fill(0.5);
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const metadata = { duration: 1000 };

      const mockFn = vi.fn();
      mockFn.prototype = {
        readAsDataURL: vi.fn(function(this: any) {
          setTimeout(() => {
            if (this.onerror) this.onerror(new Error('FileReader failed'));
          }, 0);
        }),
      };
      global.FileReader = mockFn as any;

      await expect(
        storeVideoEmbedding(mockEmbedding, mockBlob, metadata)
      ).rejects.toThrow();
    });

    it('includes optional width and height in metadata', async () => {
      const mockEmbedding = new Float32Array(512).fill(0.5);
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const metadata = {
        duration: 5000,
        width: 1920,
        height: 1080,
      };

      const mockFn = vi.fn();
      mockFn.prototype = {
        readAsDataURL: vi.fn(function(this: any) {
          setTimeout(() => {
            this.result = 'data:video/webm;base64,dGVzdA==';
            if (this.onloadend) this.onloadend();
          }, 0);
        }),
      };
      global.FileReader = mockFn as any;

      await storeVideoEmbedding(mockEmbedding, mockBlob, metadata);

      const insertCall = mockInsertScreenData.mock.calls[0][0][0];
      const decryptedContent = insertCall.content;
      expect(decryptedContent).toContain('width');
      expect(decryptedContent).toContain('height');
    });
  });

  describe('memoryService export', () => {
    it('exports trackMessage and storeVideoEmbedding', () => {
      expect(memoryService.trackMessage).toBe(trackMessage);
      expect(memoryService.storeVideoEmbedding).toBe(storeVideoEmbedding);
    });
  });
});
