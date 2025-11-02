import { beforeEach, describe, expect, it, vi } from 'vitest';

const mediaRecorderState = vi.hoisted(() => ({
  isTypeSupported: vi.fn(),
  started: false,
  startCalls: [] as Array<number | undefined>,
}));

class FakeMediaRecorder {
  static isTypeSupported = mediaRecorderState.isTypeSupported;

  onstart: (() => void) | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  readonly mimeType: string;

  constructor(public stream: MediaStream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType || 'video/webm';
  }

  start(timeslice?: number) {
    mediaRecorderState.started = true;
    mediaRecorderState.startCalls.push(timeslice);
    this.onstart?.();
  }

  stop() {
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['chunk'], { type: this.mimeType }) });
    }
    this.onstop?.();
  }
}

vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

const createObjectURLMock = vi.fn(() => 'blob://mock');
const revokeObjectURLMock = vi.fn();
Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  },
});

const getDisplayMediaMock = vi.fn();
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getDisplayMedia: getDisplayMediaMock,
  },
  configurable: true,
});

import { createNativeRecorder } from './native';

const makeStream = () => {
  const track: MediaStreamTrack = {
    kind: 'video',
    enabled: true,
    id: 'track-1',
    label: 'Screen',
    muted: false,
    readyState: 'live',
    stop: vi.fn(),
    clone: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    applyConstraints: vi.fn(),
    getCapabilities: vi.fn(),
    getConstraints: vi.fn(),
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  } as any;

  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    getAudioTracks: () => [],
    getTrackById: vi.fn(),
    id: 'stream-1',
    active: true,
    oninactive: null,
    onaddtrack: null,
    onremovetrack: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaStream;

  return { stream, track };
};

describe('native desktop recorder', () => {
  beforeEach(() => {
    mediaRecorderState.isTypeSupported.mockReset();
    mediaRecorderState.started = false;
    mediaRecorderState.startCalls.length = 0;
    getDisplayMediaMock.mockReset();
    createObjectURLMock.mockClear();
  });

  it('selects the first supported mime type before starting', async () => {
    mediaRecorderState.isTypeSupported
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const { stream } = makeStream();
    getDisplayMediaMock.mockResolvedValue(stream);

    const recorder = createNativeRecorder();
    await recorder.start();

    expect(mediaRecorderState.isTypeSupported).toHaveBeenCalledWith('video/webm;codecs=vp9');
    expect(mediaRecorderState.isTypeSupported).toHaveBeenCalledWith('video/webm;codecs=vp8');

    await recorder.stop();
  });

  it('records screen video and returns metadata on stop', async () => {
    mediaRecorderState.isTypeSupported.mockReturnValue(true);

    const { stream, track } = makeStream();
    getDisplayMediaMock.mockResolvedValue(stream);

    const recorder = createNativeRecorder();
    await recorder.start({ withAudio: true });

    expect(getDisplayMediaMock).toHaveBeenCalledWith({
      video: { frameRate: 30 },
      audio: true,
    });
    expect(mediaRecorderState.started).toBe(true);
    expect(mediaRecorderState.startCalls).toEqual([250]);

    const result = await recorder.stop();

    expect(result.mimeType).toBe('video/webm;codecs=vp9'); // default when supported
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.fps).toBe(30);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.objectUrl).toBe('blob://mock');

    expect(track.stop).toHaveBeenCalled();
  });

  it('throws when stop called before start', async () => {
    const recorder = createNativeRecorder();
    await expect(recorder.stop()).rejects.toThrow('Not recording');
  });
});
