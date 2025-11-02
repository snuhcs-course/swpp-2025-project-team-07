/**
 * Browser-side video frame extractor for debugging purposes
 * Extracts frames from video blobs using HTML5 Video and Canvas APIs
 */

export interface ExtractedFramePreview {
  dataUrl: string; // Data URL for preview
  timestamp: number; // Timestamp in seconds
  frameNumber: number; // Frame index
}

/**
 * Extract frames from a video blob at specified FPS (browser-side)
 * This is used for debugging to preview frames in the console
 */
export async function extractFramesFromVideoBlob(
  videoBlob: Blob,
  fps: number = 1,
  maxFrames: number = 50
): Promise<ExtractedFramePreview[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const frames: ExtractedFramePreview[] = [];
    let currentFrame = 0;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const interval = 1 / fps; // Time between frames
      const totalFrames = Math.min(Math.floor(duration * fps), maxFrames);

      console.log(`[Frame Extractor Browser] Video duration: ${duration}s, extracting ${totalFrames} frames at ${fps} fps`);

      if (totalFrames === 0) {
        reject(new Error(`Video too short (${duration}s) to extract frames at ${fps} fps`));
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      const extractFrame = () => {
        if (currentFrame >= totalFrames) {
          console.log(`[Frame Extractor Browser] Extraction complete: ${frames.length} frames`);
          URL.revokeObjectURL(video.src);
          resolve(frames);
          return;
        }

        const timestamp = Math.min(currentFrame * interval, duration - 0.1); // Ensure we don't seek past end
        video.currentTime = timestamp;
      };

      video.onseeked = () => {
        // Set canvas size to video dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        frames.push({
          dataUrl,
          timestamp: video.currentTime,
          frameNumber: currentFrame
        });

        console.log(`[Frame Extractor Browser] Extracted frame ${currentFrame + 1}/${totalFrames} at t=${video.currentTime.toFixed(2)}s`);

        currentFrame++;
        extractFrame();
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Video loading failed'));
      };

      extractFrame();
    };

    video.src = URL.createObjectURL(videoBlob);
  });
}

/**
 * Display frames in console as images
 */
export function displayFramesInConsole(frames: ExtractedFramePreview[]): void {
  console.log(`=== ${frames.length} Extracted Frames ===`);

  frames.forEach((frame, idx) => {
    console.log(
      `%cFrame ${idx + 1} (t=${frame.timestamp.toFixed(2)}s)`,
      'font-weight: bold; color: #0066cc;'
    );

    // Create an image element for console display
    const img = new Image();
    img.src = frame.dataUrl;
    img.style.maxWidth = '400px';
    img.style.border = '2px solid #0066cc';
    img.style.borderRadius = '4px';

    console.log(img);
  });
}

/**
 * Open frames in a new window for inspection
 */
export function openFramesInWindow(frames: ExtractedFramePreview[]): void {
  const win = window.open('', '_blank');
  if (!win) {
    console.error('Could not open new window (popup blocked?)');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Extracted Frames Preview</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          padding: 20px;
          background: #f5f5f5;
        }
        h1 {
          color: #333;
        }
        .frame-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        .frame-card {
          background: white;
          border-radius: 8px;
          padding: 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .frame-card img {
          width: 100%;
          border-radius: 4px;
          display: block;
        }
        .frame-info {
          margin-top: 8px;
          font-size: 14px;
          color: #666;
        }
        .frame-number {
          font-weight: bold;
          color: #0066cc;
        }
      </style>
    </head>
    <body>
      <h1>Extracted Frames (${frames.length} frames at 1 fps)</h1>
      <div class="frame-grid">
        ${frames.map((frame, idx) => `
          <div class="frame-card">
            <img src="${frame.dataUrl}" alt="Frame ${idx + 1}" />
            <div class="frame-info">
              <div class="frame-number">Frame ${idx + 1}</div>
              <div>Timestamp: ${frame.timestamp.toFixed(2)}s</div>
            </div>
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}
