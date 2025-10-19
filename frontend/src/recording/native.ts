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
    // 필요 시 권한/프리플라이트 등을 여기서 처리
  }

  async start(opts?: { sourceId?: string; withAudio?: boolean }) {
    this.chunks = [];
    const withAudio = opts?.withAudio ?? false;

    // ① source 자동 선택이 필요 없다면: 시스템/브라우저 픽커 사용
    // (ChatHeader가 getSources/chooseSource를 찾다가 없으면 그냥 start만 호출함. :contentReference[oaicite:3]{index=3})
    const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: { frameRate: 30 },  // 필요 시 조정
      audio: withAudio,
    });

    this.stream = displayStream;

    const mimeType = pickBestMime();
    const mr = new MediaRecorder(displayStream, {
      mimeType,
      videoBitsPerSecond: 5_000_000, // 품질/용량 트레이드오프
    });
    this.mediaRecorder = mr;

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    await new Promise<void>((resolve) => {
      mr.onstart = () => resolve();
      // timeslice를 주면 주기적으로 dataavailable 발생 → stop 시 Blob 합치기만 하면 됨
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

    // 트랙 정리
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
      objectUrl: URL.createObjectURL(blob), // 미리보기 용도(다 쓰면 revoke 필요)
    };
  }
}

export function createNativeRecorder(): BaseDesktopRecorder {
  return new NativeDesktopRecorder();
}
