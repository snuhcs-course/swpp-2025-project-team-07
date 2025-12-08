export async function loadCollection() {
  const useEncrypted = (import.meta as any).env?.VITE_USE_ENCRYPTED_VECTOR_DB === 'true';

  if (useEncrypted) {
    return await import('./encrypted-collection');
  } else {
    return await import('./collection');
  }
}
