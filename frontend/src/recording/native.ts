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
  private isStopping = false;

  init() {
    // no-op
  }

  async start(opts?: { sourceId?: string; withAudio?: boolean }) {
    this.chunks = [];
    this.isStopping = false;
    const withAudio = opts?.withAudio ?? false;

    if (!this.stream || !this.stream.active) {
      console.log('[NativeRecorder] Acquiring new display media stream...');
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 30 },  // control the frame rate
        audio: withAudio,
      });
      this.stream = displayStream;
    } else {
      console.log('[NativeRecorder] Reusing existing display media stream.');
    }

    const mimeType = pickBestMime();
    const mr = new MediaRecorder(this.stream!, {
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

  async stop(options?: { releaseStream?: boolean }): Promise<RecordingResult> {
    if (!this.mediaRecorder) throw new Error('Not recording');
    if (this.isStopping) {
      throw new Error('Stop is already in progress');
    }
    this.isStopping = true;
    const mr = this.mediaRecorder;

    try {
      const done = new Promise<void>((resolve, reject) => {
        mr.onstop = () => resolve();
        mr.onerror = (e) => reject(new Error('MediaRecorder stop error'));
      });
      mr.stop();
      await done;

      const endedAt = Date.now();
      const blob = new Blob(this.chunks, { type: mr.mimeType });

      if (options?.releaseStream) {
        console.log('[NativeRecorder] Releasing display media stream.');
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = undefined;
      }

      const [v] = (this.stream ?? mr.stream)?.getVideoTracks() ?? [];
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
    } finally {
      this.isStopping = false;
      this.mediaRecorder = undefined; 
      this.chunks = [];
    }
  }
}

export function createNativeRecorder(): BaseDesktopRecorder {
  return new NativeDesktopRecorder();
}
