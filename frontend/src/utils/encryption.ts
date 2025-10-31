// AES-256-GCM client-side encryption for chat data

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyB64 = (import.meta as any).env?.VITE_ENCRYPTION_KEY;
  if (!keyB64) throw new Error('VITE_ENCRYPTION_KEY not configured');

  try {
    const keyData = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
    if (keyData.length !== 32) throw new Error('Encryption key must be 32 bytes (256 bits)');

    return await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    throw new Error(`Failed to import encryption key: ${error}`);
  }
}

// Encrypts text and returns base64-encoded result (format: iv||ciphertext)
export async function encryptText(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;

  try {
    const key = await getEncryptionKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      plaintextBytes
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Convert to base64 in chunks to avoid call stack overflow on large data
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < combined.length; i += chunkSize) {
      const chunk = combined.subarray(i, Math.min(i + chunkSize, combined.length));
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error(`Encryption failed: ${error}`);
  }
}

// Decrypts base64-encoded ciphertext
export async function decryptText(ciphertext: string): Promise<string> {
  if (!ciphertext) return ciphertext;

  try {
    const key = await getEncryptionKey();
    const binary = atob(ciphertext);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }
    const iv = combined.slice(0, 12); // First 12 bytes
    const encryptedData = combined.slice(12); // Rest

    const plaintextBytes = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encryptedData
    );

    return new TextDecoder().decode(plaintextBytes);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error(`Decryption failed: ${error}`);
  }
}
