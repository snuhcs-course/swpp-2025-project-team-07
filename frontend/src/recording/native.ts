import type { BaseDesktopRecorder, RecordingResult } from './base';

function pickBestMime(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
}

class NativeDesktopRecorder implements BaseDesktopRecorder {
  private mediaRecorder?: MediaRecorder;
  private chunks: BlobPart[] = [];
  private stream?: MediaStream;
  private startedAt = 0;

  init() {
    // no-op
  }

  async start(opts?: { sourceId?: string; withAudio?: boolean }) {
    this.chunks = [];
    const withAudio = opts?.withAudio ?? false;

    const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: { frameRate: 30 },  // control the frame rate
      audio: withAudio,
    });

    this.stream = displayStream;

    const mimeType = pickBestMime();
    const mr = new MediaRecorder(displayStream, {
      mimeType,
      videoBitsPerSecond: 5_000_000, // control the quality of the video
    });
    this.mediaRecorder = mr;

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    await new Promise<void>((resolve) => {
      mr.onstart = () => resolve();
      mr.start(250);
    });

    this.startedAt = Date.now();
  }

  async stop(): Promise<RecordingResult> {
    if (!this.mediaRecorder) throw new Error('Not recording');
    const mr = this.mediaRecorder;

    const done = new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
    });
    mr.stop();
    await done;

    const endedAt = Date.now();
    const blob = new Blob(this.chunks, { type: mr.mimeType });

    this.stream?.getTracks().forEach((t) => t.stop());

    const [v] = this.stream?.getVideoTracks() ?? [];
    const s = v?.getSettings?.() ?? {};
    const width = Number(s.width ?? 0);
    const height = Number(s.height ?? 0);
    const fps = Number(s.frameRate ?? 0);

    return {
      blob,
      mimeType: mr.mimeType,
      durationMs: endedAt - this.startedAt,
      width,
      height,
      fps,
      startedAt: this.startedAt,
      endedAt,
      objectUrl: URL.createObjectURL(blob), // for preview
    };
  }
}

export function createNativeRecorder(): BaseDesktopRecorder {
  return new NativeDesktopRecorder();
}
