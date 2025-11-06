import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set ffmpeg binary path (use @ffmpeg-installer/ffmpeg for Electron compatibility)
const ffmpegBinaryPath = ffmpegInstaller.path.includes('app.asar')
  ? ffmpegInstaller.path.replace('app.asar', 'app.asar.unpacked')
  : ffmpegInstaller.path;

console.log('[FFmpeg] Binary path:', ffmpegBinaryPath);
ffmpeg.setFfmpegPath(ffmpegBinaryPath);

export interface FrameExtractionOptions {
  fps?: number; // Frames per second (default: 1)
  quality?: number; // JPEG quality 1-100 (default: 85)
  maxFrames?: number; // Maximum frames to extract (default: unlimited)
}

export interface ExtractedFrame {
  base64: string; // Base64-encoded JPEG image (without data URL prefix)
  timestamp: number; // Timestamp in seconds
  frameNumber: number; // Frame index (0-based)
}

/**
 * Extract frames from a video buffer at specified FPS
 * @param videoBuffer - Video file as Buffer
 * @param options - Extraction options
 * @returns Array of extracted frames as base64 JPEG strings
 */
export async function extractFramesFromVideo(
  videoBuffer: Buffer,
  options: FrameExtractionOptions = {}
): Promise<ExtractedFrame[]> {
  const fps = options.fps ?? 1;
  const quality = options.quality ?? 85;
  const maxFrames = options.maxFrames;

  // Create temporary directory for processing
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-frames-'));
  const tempVideoPath = path.join(tempDir, 'input.webm');
  const framePattern = path.join(tempDir, 'frame_%04d.jpg');

  try {
    // Write video buffer to temp file
    fs.writeFileSync(tempVideoPath, videoBuffer);

    // Extract frames using FFmpeg
    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(tempVideoPath)
        .outputOptions([
          `-vf fps=${fps}`, // Extract frames at specified FPS
          `-q:v ${Math.round((100 - quality) / 4)}` // JPEG quality (FFmpeg uses 2-31 scale, inverted)
        ])
        .output(framePattern)
        .on('end', () => resolve())
        .on('error', (err) => reject(err));

      // Limit number of frames if specified
      if (maxFrames) {
        command = command.outputOptions([`-frames:v ${maxFrames}`]);
      }

      command.run();
    });

    // Read extracted frames
    const frameFiles = fs.readdirSync(tempDir)
      .filter(file => file.startsWith('frame_') && file.endsWith('.jpg'))
      .sort();

    const frames: ExtractedFrame[] = [];

    for (let i = 0; i < frameFiles.length; i++) {
      const framePath = path.join(tempDir, frameFiles[i]);
      const frameBuffer = fs.readFileSync(framePath);
      const base64 = frameBuffer.toString('base64');

      frames.push({
        base64,
        timestamp: i / fps, // Calculate timestamp based on frame index and FPS
        frameNumber: i
      });
    }

    return frames;
  } finally {
    // Cleanup: Remove temporary directory and all files
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    } catch (cleanupError) {
      console.error('Error cleaning up temp directory:', cleanupError);
    }
  }
}

/**
 * Extract frames from multiple videos and return combined array
 * @param videoBuffers - Array of video buffers
 * @param options - Extraction options
 * @returns Combined array of extracted frames from all videos
 */
export async function extractFramesFromVideos(
  videoBuffers: Buffer[],
  options: FrameExtractionOptions = {}
): Promise<ExtractedFrame[]> {
  const allFrames: ExtractedFrame[] = [];

  for (const videoBuffer of videoBuffers) {
    try {
      const frames = await extractFramesFromVideo(videoBuffer, options);
      allFrames.push(...frames);
    } catch (error) {
      console.error('Error extracting frames from video:', error);
      // Continue with other videos even if one fails
    }
  }

  return allFrames;
}

/**
 * Get video duration in seconds
 * @param videoBuffer - Video file as Buffer
 * @returns Duration in seconds
 */
export async function getVideoDuration(videoBuffer: Buffer): Promise<number> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-info-'));
  const tempVideoPath = path.join(tempDir, 'input.webm');

  try {
    fs.writeFileSync(tempVideoPath, videoBuffer);

    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempVideoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          resolve(duration);
        }
      });
    });
  } finally {
    // Cleanup
    try {
      fs.unlinkSync(tempVideoPath);
      fs.rmdirSync(tempDir);
    } catch (cleanupError) {
      console.error('Error cleaning up temp directory:', cleanupError);
    }
  }
}
