import { describe, it, expectTypeOf } from 'vitest';
import type { BaseDesktopRecorder, RecordingResult } from './base';

describe('recording base types', () => {
  it('RecordingResult matches expected shape', () => {
    expectTypeOf<RecordingResult>().toMatchTypeOf<{
      blob: Blob;
      mimeType: string;
      durationMs: number;
      width: number;
      height: number;
      fps?: number | undefined;
      startedAt: number;
      endedAt: number;
      objectUrl?: string | undefined;
    }>();
  });

  it('BaseDesktopRecorder interface exposes lifecycle methods', () => {
    expectTypeOf<BaseDesktopRecorder>().toMatchTypeOf<{
      init: () => Promise<void> | void;
      start: (opts?: { sourceId?: string; withAudio?: boolean }) => Promise<void>;
      stop: () => Promise<RecordingResult>;
    }>();

    expectTypeOf<BaseDesktopRecorder>().toMatchTypeOf<{
      getSources?: () => Promise<Array<{ id: string; name: string; thumbnailURL?: string }>>;
      chooseSource?: (sourceId: string) => Promise<void>;
    }>();
  });
});
