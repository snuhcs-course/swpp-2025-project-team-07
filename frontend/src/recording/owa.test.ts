import { describe, it, expect } from 'vitest';
import { OWADesktopRecorder } from './owa';

describe('OWADesktopRecorder', () => {
  it('returns empty source list by default', async () => {
    const recorder = new OWADesktopRecorder();
    await recorder.init();
    await expect(recorder.getSources?.()).resolves.toEqual([]);
  });

  it('throws for start until implementation provided', async () => {
    const recorder = new OWADesktopRecorder();
    await expect(recorder.start()).rejects.toThrow('OWA impl not yet available');
  });

  it('stop resolves to null placeholder', async () => {
    const recorder = new OWADesktopRecorder();
    await expect(recorder.stop()).resolves.toBeNull();
  });
});
