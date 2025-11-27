import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptText, decryptText } from './encryption';

describe('encryption', () => {
  const mockEncryptionKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 32 bytes in base64

  beforeEach(() => {
    vi.clearAllMocks();
    // Set encryption key in environment
    (import.meta as any).env = {
      VITE_ENCRYPTION_KEY: mockEncryptionKey,
    };

    // Suppress console errors during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('encryptText', () => {
    it('encrypts plaintext and returns base64 string', async () => {
      const plaintext = 'Hello, World!';
      const encrypted = await encryptText(plaintext);

      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe('string');
      // Base64 encoded string should not equal plaintext
      expect(encrypted).not.toBe(plaintext);
    });

    it('returns empty string for empty input', async () => {
      const result = await encryptText('');
      expect(result).toBe('');
    });

    it('encrypts long text successfully', async () => {
      const longText = 'A'.repeat(10000);
      const encrypted = await encryptText(longText);

      expect(encrypted).toBeTruthy();
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('produces different ciphertext for same plaintext (due to random IV)', async () => {
      const plaintext = 'Test message';

      const encrypted1 = await encryptText(plaintext);
      const encrypted2 = await encryptText(plaintext);

      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decryptText', () => {
    it('decrypts encrypted text back to original', async () => {
      const plaintext = 'Secret message';

      const encrypted = await encryptText(plaintext);
      const decrypted = await decryptText(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('returns empty string for empty input', async () => {
      const result = await decryptText('');
      expect(result).toBe('');
    });

    it('decrypts long encrypted text correctly', async () => {
      const longText = 'Lorem ipsum dolor sit amet, '.repeat(100);

      const encrypted = await encryptText(longText);
      const decrypted = await decryptText(encrypted);

      expect(decrypted).toBe(longText);
    });

    it('handles unicode characters correctly', async () => {
      const unicode = 'Hello 世界 🌍 مرحبا';

      const encrypted = await encryptText(unicode);
      const decrypted = await decryptText(encrypted);

      expect(decrypted).toBe(unicode);
    });

    it('throws error for invalid base64 ciphertext', async () => {
      await expect(decryptText('invalid-base64!!!')).rejects.toThrow();
    });

    it('throws error for tampered ciphertext', async () => {
      const plaintext = 'Original message';
      const encrypted = await encryptText(plaintext);

      // Tamper with the ciphertext
      const tamperedEncrypted = encrypted.substring(0, encrypted.length - 5) + 'XXXXX';

      await expect(decryptText(tamperedEncrypted)).rejects.toThrow();
    });
  });

  describe('round-trip encryption/decryption', () => {
    it('handles special characters', async () => {
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

      const encrypted = await encryptText(special);
      const decrypted = await decryptText(encrypted);

      expect(decrypted).toBe(special);
    });

    it('handles newlines and whitespace', async () => {
      const text = 'Line 1\nLine 2\n\tTabbed\n   Spaces';

      const encrypted = await encryptText(text);
      const decrypted = await decryptText(encrypted);

      expect(decrypted).toBe(text);
    });

    it('handles empty lines and multiple newlines',async () => {
      const text = 'Paragraph 1\n\n\nParagraph 2';

      const encrypted = await encryptText(text);
      const decrypted = await decryptText(encrypted);

      expect(decrypted).toBe(text);
    });

    it('handles JSON data', async () => {
      const jsonData = JSON.stringify({
        user: 'test',
        message: 'Hello',
        timestamp: 123456,
      });

      const encrypted = await encryptText(jsonData);
      const decrypted = await decryptText(encrypted);

      expect(decrypted).toBe(jsonData);
      expect(JSON.parse(decrypted)).toEqual({
        user: 'test',
        message: 'Hello',
        timestamp: 123456,
      });
    });
  });
});
