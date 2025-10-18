export type SampledFrame = {
  time: number;                // timestamp - seconds
  imageData: ImageData;        // 224x224
};

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

      const duration = video.duration; // 초
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
      const times = Array.from({ length: K }, (_, i) => ( (i + 0.5) * duration / K ));

      for (const t of times) {
        await seek(video, Math.min(t, Math.max(0, duration - 0.001)));
        drawCenterCrop(ctx, video, targetSize, targetSize);
        const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
        frames.push({ time: t, imageData });
      }

      return { frames, duration, width, height };
    } finally {
      URL.revokeObjectURL(url);
    }

    function seek(videoEl: HTMLVideoElement, time: number) {
      return new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Seek failed'));
        };
        const cleanup = () => {
          videoEl.removeEventListener('seeked', onSeeked);
          videoEl.removeEventListener('error', onError);
        };
        videoEl.addEventListener('seeked', onSeeked);
        videoEl.addEventListener('error', onError);
        videoEl.currentTime = time;
      });
    }

    function drawCenterCrop(
      ctx: CanvasRenderingContext2D,
      source: HTMLVideoElement,
      outW: number,
      outH: number
    ) {
      const sW = source.videoWidth;
      const sH = source.videoHeight;
      const srcAspect = sW / sH;
      const dstAspect = outW / outH;

      let sx = 0, sy = 0, sw = sW, sh = sH;
      if (srcAspect > dstAspect) {
        sw = Math.floor(sH * dstAspect);
        sx = Math.floor((sW - sw) / 2);
      } else if (srcAspect < dstAspect) {
        sh = Math.floor(sW / dstAspect);
        sy = Math.floor((sH - sh) / 2);
      }
      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
    }
  }
}
