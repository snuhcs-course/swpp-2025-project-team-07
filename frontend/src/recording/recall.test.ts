import { describe, it, expect } from 'vitest';
import { RecallDesktopRecorder } from './recall';

describe('RecallDesktopRecorder', () => {
  it('init resolves and getSources defaults to empty', async () => {
    const recorder = new RecallDesktopRecorder();
    await recorder.init();
    await expect(recorder.getSources?.()).resolves.toEqual([]);
  });

  it('start rejects until recall bridge implemented', async () => {
    const recorder = new RecallDesktopRecorder();
    await expect(recorder.start()).rejects.toThrow('Recall impl not yet available');
  });

  it('stop resolves to null placeholder', async () => {
    const recorder = new RecallDesktopRecorder();
    await expect(recorder.stop()).resolves.toBeNull();
  });
});
