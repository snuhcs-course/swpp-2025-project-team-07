import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoFrameSampler, sampleUniformFrames, type SampledFrame } from './video-sampler';

describe('VideoFrameSampler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('sampleUniformFrames', () => {
    it('should call VideoFrameSampler.uniformSample with correct parameters', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });
      const spy = vi.spyOn(VideoFrameSampler, 'uniformSample').mockResolvedValue({
        frames: [{ time: 0, image: {} as ImageData, imageData: {} as ImageData }],
        duration: 10,
        width: 640,
        height: 480,
      });

      await sampleUniformFrames(mockBlob, 5, { size: 256 });

      expect(spy).toHaveBeenCalledWith(mockBlob, 5, 256);
      spy.mockRestore();
    });

    it('should use default size of 224 when not provided', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });
      const spy = vi.spyOn(VideoFrameSampler, 'uniformSample').mockResolvedValue({
        frames: [],
        duration: 10,
        width: 640,
        height: 480,
      });

      await sampleUniformFrames(mockBlob, 3);

      expect(spy).toHaveBeenCalledWith(mockBlob, 3, 224);
      spy.mockRestore();
    });

    it('should enforce minimum count of 1', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });
      const spy = vi.spyOn(VideoFrameSampler, 'uniformSample').mockResolvedValue({
        frames: [],
        duration: 10,
        width: 640,
        height: 480,
      });

      await sampleUniformFrames(mockBlob, 0);
      expect(spy).toHaveBeenCalledWith(mockBlob, 1, 224);

      await sampleUniformFrames(mockBlob, -5);
      expect(spy).toHaveBeenCalledWith(mockBlob, 1, 224);

      spy.mockRestore();
    });

    it('should return frames from uniformSample', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });
      const mockFrames = [
        { time: 0, image: {} as ImageData, imageData: {} as ImageData },
        { time: 5, image: {} as ImageData, imageData: {} as ImageData },
      ];

      vi.spyOn(VideoFrameSampler, 'uniformSample').mockResolvedValue({
        frames: mockFrames,
        duration: 10,
        width: 640,
        height: 480,
      });

      const result = await sampleUniformFrames(mockBlob, 2);

      expect(result).toEqual(mockFrames);
    });
  });

  describe('VideoFrameSampler.uniformSample', () => {
    it('should create video element and load metadata', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 640,
            videoHeight: 480,
            duration: 10,
            readyState: 4,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 0);
              }
            }),
            removeEventListener: vi.fn(),
          };

          // Trigger loadedmetadata asynchronously
          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      // Mock URL.createObjectURL and revokeObjectURL
      const mockUrl = 'blob:mock';
      vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockUrl);
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const result = await VideoFrameSampler.uniformSample(mockBlob, 1, 224);

      expect(result.duration).toBe(10);
      expect(result.width).toBe(640);
      expect(result.height).toBe(480);
      expect(result.frames).toHaveLength(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockUrl);
    });

    it('should handle multiple frames with uniform timestamps', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 1920,
            videoHeight: 1080,
            duration: 20,
            readyState: 4,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 0);
              }
            }),
            removeEventListener: vi.fn(),
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const result = await VideoFrameSampler.uniformSample(mockBlob, 4, 224);

      expect(result.frames).toHaveLength(4);
      // Check that timestamps are uniformly distributed
      expect(result.frames[0].time).toBeCloseTo(2.5, 1); // (0.5 * 20) / 4
      expect(result.frames[1].time).toBeCloseTo(7.5, 1); // (1.5 * 20) / 4
      expect(result.frames[2].time).toBeCloseTo(12.5, 1); // (2.5 * 20) / 4
      expect(result.frames[3].time).toBeCloseTo(17.5, 1); // (3.5 * 20) / 4
    });

    it('should throw error when canvas context is not available', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 640,
            videoHeight: 480,
            duration: 10,
            readyState: 4,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => null), // Return null to trigger error
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await expect(VideoFrameSampler.uniformSample(mockBlob, 1, 224))
        .rejects.toThrow('Canvas 2D context not available');
    });

    it('should handle video metadata load error', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 0,
            videoHeight: 0,
            duration: 0,
            readyState: 0,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          };

          // Trigger error asynchronously
          setTimeout(() => {
            if (videoElement.onerror) {
              videoElement.onerror(new Event('error'));
            }
          }, 0);

          return videoElement;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await expect(VideoFrameSampler.uniformSample(mockBlob, 1, 224))
        .rejects.toThrow('Failed to load video metadata');

      // Should still revoke URL even on error (finally block)
      expect(revokeObjectURLSpy).toHaveBeenCalled();
    });

    it('should enforce minimum frameCount of 1', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 640,
            videoHeight: 480,
            duration: 10,
            readyState: 4,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 0);
              }
            }),
            removeEventListener: vi.fn(),
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const result = await VideoFrameSampler.uniformSample(mockBlob, 0, 224);
      expect(result.frames).toHaveLength(1);
    });

    it('should set canvas dimensions to targetSize', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });
      const targetSize = 512;

      let canvasWidth = 0;
      let canvasHeight = 0;
      let videoCreated = false;
      let canvasCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 1920,
            videoHeight: 1080,
            duration: 10,
            readyState: 4,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 0);
              }
            }),
            removeEventListener: vi.fn(),
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            get width() { return canvasWidth; },
            set width(v) { canvasWidth = v; },
            get height() { return canvasHeight; },
            set height(v) { canvasHeight = v; },
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(targetSize * targetSize * 4),
                width: targetSize,
                height: targetSize,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await VideoFrameSampler.uniformSample(mockBlob, 1, targetSize);

      expect(canvasWidth).toBe(targetSize);
      expect(canvasHeight).toBe(targetSize);
    });

    it('should return frame with correct structure', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 640,
            videoHeight: 480,
            duration: 5,
            readyState: 4,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 0);
              }
            }),
            removeEventListener: vi.fn(),
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const result = await VideoFrameSampler.uniformSample(mockBlob, 1, 224);

      const frame = result.frames[0];
      expect(frame).toHaveProperty('time');
      expect(frame).toHaveProperty('image');
      expect(frame).toHaveProperty('imageData');
      expect(typeof frame.time).toBe('number');
      expect(frame.image).toBeTruthy();
      expect(frame.imageData).toBeTruthy();
    });

    it('should handle different aspect ratios (portrait video)', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;
      let drawImageCalls: any[] = [];

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 480,  // Portrait: width < height
            videoHeight: 640,
            duration: 5,
            readyState: 4,
            currentTime: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 0);
              }
            }),
            removeEventListener: vi.fn(),
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn((...args) => {
                drawImageCalls.push(args);
              }),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const result = await VideoFrameSampler.uniformSample(mockBlob, 1, 224);

      expect(result.frames).toHaveLength(1);
      // Verify that drawImage was called with cropping parameters
      expect(drawImageCalls.length).toBeGreaterThan(0);
    });

    it('should handle seek errors gracefully', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            videoWidth: 640,
            videoHeight: 480,
            duration: 10,
            readyState: 4,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'error') {
                // Trigger error when seeking
                setTimeout(() => handler(new Event('error')), 5);
              }
            }),
            removeEventListener: vi.fn(),
            set currentTime(_t: number) {
              // Simulate error when setting currentTime
              const errorEvent = new Event('error');
              if (videoElement.addEventListener.mock.calls.find((call: any) => call[0] === 'error')) {
                const errorHandler = videoElement.addEventListener.mock.calls.find((call: any) => call[0] === 'error')[1];
                setTimeout(() => errorHandler(errorEvent), 0);
              }
            },
            get currentTime() { return 0; },
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas') {
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await expect(VideoFrameSampler.uniformSample(mockBlob, 2, 224))
        .rejects.toThrow();
    });

    it('should handle metadata loading errors', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          const videoElement: any = {
            readyState: 0,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'error') {
                setTimeout(() => handler(new Event('error')), 5);
              }
            }),
            removeEventListener: vi.fn(),
          };

          setTimeout(() => {
            if (videoElement.onerror) {
              videoElement.onerror(new Event('error'));
            }
          }, 0);

          return videoElement;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await expect(VideoFrameSampler.uniformSample(mockBlob, 1, 224))
        .rejects.toThrow('Failed to load video metadata');
    });

    it('should handle NaN or Infinity duration', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;
      let timeUpdateCount = 0;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          let _currentTime = 0;
          let _duration = NaN;

          const videoElement: any = {
            videoWidth: 640,
            videoHeight: 480,
            get duration() {
              return _duration;
            },
            readyState: 4,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'timeupdate') {
                setTimeout(() => {
                  timeUpdateCount++;
                  _duration = 10;
                  handler(new Event('timeupdate'));
                }, 5);
              }
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 10);
              }
            }),
            removeEventListener: vi.fn(),
            set currentTime(t: number) {
              _currentTime = t;
              if (t > 1000) {
                const timeUpdateHandlers = videoElement.addEventListener.mock.calls
                  .filter((call: any) => call[0] === 'timeupdate')
                  .map((call: any) => call[1]);
                timeUpdateHandlers.forEach((handler: any) => {
                  setTimeout(() => handler(new Event('timeupdate')), 0);
                });
              }
            },
            get currentTime() {
              return _currentTime;
            },
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const result = await VideoFrameSampler.uniformSample(mockBlob, 1, 224);

      expect(result.frames).toHaveLength(1);
      expect(timeUpdateCount).toBeGreaterThan(0);
    });

    it('should handle currentTime setter throwing exception', async () => {
      const mockBlob = new Blob(['video'], { type: 'video/webm' });

      let videoCreated = false;
      let canvasCreated = false;
      let setCurrentTimeCalled = false;

      const createElementSpy = vi.spyOn(document, 'createElement');
      createElementSpy.mockImplementation((tagName: string) => {
        if (tagName === 'video' && !videoCreated) {
          videoCreated = true;
          let _currentTime = 0;

          const videoElement: any = {
            videoWidth: 640,
            videoHeight: 480,
            duration: 10,
            readyState: 4,
            muted: false,
            playsInline: false,
            src: '',
            onloadedmetadata: null,
            onerror: null,
            addEventListener: vi.fn((event: string, handler: any) => {
              if (event === 'seeked') {
                setTimeout(() => handler(new Event('seeked')), 10);
              }
            }),
            removeEventListener: vi.fn(),
            set currentTime(t: number) {
              // After metadata is loaded, throw on first seek attempt
              if (!setCurrentTimeCalled && t > 0 && t < 10) {
                setCurrentTimeCalled = true;
                throw new Error('currentTime setter failed');
              }
              _currentTime = t;
            },
            get currentTime() {
              return _currentTime;
            },
          };

          setTimeout(() => {
            if (videoElement.onloadedmetadata) {
              videoElement.onloadedmetadata(new Event('loadedmetadata'));
            }
          }, 0);

          return videoElement;
        }
        if (tagName === 'canvas' && !canvasCreated) {
          canvasCreated = true;
          const canvas: any = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              clearRect: vi.fn(),
              drawImage: vi.fn(),
              getImageData: vi.fn(() => ({
                data: new Uint8ClampedArray(224 * 224 * 4),
                width: 224,
                height: 224,
              })),
            })),
          };
          return canvas;
        }
        return document.createElement(tagName);
      });

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await expect(VideoFrameSampler.uniformSample(mockBlob, 1, 224))
        .rejects.toThrow('currentTime setter failed');
    });
  });
});
