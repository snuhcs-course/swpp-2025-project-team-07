export type SampledFrame = {
  time: number;                                      // timestamp - seconds
  image: ImageData | ImageBitmap | HTMLCanvasElement; // 임베더가 소비하는 표준 키
  imageData?: ImageData;                              // (optional) 기존 코드 호환
};

// wait until video metadata is loaded
async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return;
  await new Promise<void>((res, rej) => {
    const onMeta = () => { cleanup(); res(); };
    const onErr = () => { cleanup(); rej(new Error('metadata error')); };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.addEventListener('error', onErr, { once: true });
  });
}

// To solve duration being NaN or Infinity
async function ensureFiniteDuration(video: HTMLVideoElement): Promise<number> {
  await waitForMetadata(video);

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    await new Promise<void>((res) => {
      const onTU = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.removeEventListener('timeupdate', onTU);
          res();
        }
      };
      video.addEventListener('timeupdate', onTU);
      try { video.currentTime = 1e101; } catch { /* noop */ }
    });
  }

  let d = video.duration;
  if (!Number.isFinite(d) || d <= 0) d = 0.001;

  try { video.currentTime = 0; } catch {}
  return d;
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('seek failed')); };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });

    try {
      video.currentTime = Number.isFinite(t) ? t : 0;
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export async function sampleUniformFrames(
  blob: Blob,
  count: number,
  opts?: { size?: number } 
): Promise<SampledFrame[]> {
  const target = Math.max(1, Math.floor(opts?.size ?? 224));
  const { frames } = await VideoFrameSampler.uniformSample(blob, Math.max(1, count), target);
  return frames;
}

export class VideoFrameSampler {
  static async uniformSample(
    blob: Blob,
    frameCount: number,
    targetSize = 224
  ): Promise<{ frames: SampledFrame[]; duration: number; width: number; height: number }> {
    const url = URL.createObjectURL(blob);
    try {
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video metadata'));
      });

      const duration = await ensureFiniteDuration(video);
      const width = video.videoWidth;
      const height = video.videoHeight;

      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D context not available');

      const frames: SampledFrame[] = [];
      const K = Math.max(1, frameCount);
      // uniform sampling timestamps
      const eps = 1e-3;
      const times = Array.from({ length: K }, (_, i) => {
        const mid = ((i + 0.5) * duration) / K; 
        return Math.max(0, Math.min(duration - eps, mid)); 
      });
      
      for (const t of times) {
        await seekTo(video, t);
        
        // Use simple resize (squash) instead of crop to preserve all screen content.
        // This is crucial for screen recordings where UI elements might be at the edges.
        ctx.clearRect(0, 0, targetSize, targetSize);
        ctx.drawImage(video, 0, 0, targetSize, targetSize);
        
        const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
        frames.push({ time: t, image: imageData, imageData });
      }

      return { frames, duration, width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}