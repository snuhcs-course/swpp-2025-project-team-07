import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { BaseDesktopRecorder } from './base';
import { desktop_recorder_factory, type RecorderKind } from './factory';
import { ClipVideoEmbedder, type ClipVideoEmbedding } from '@/embedding/ClipVideoEmbedder';

const RecorderCtx = createContext<BaseDesktopRecorder | null>(null);

export function RecorderProvider({
  children,
  impl = (import.meta.env.VITE_RECORDER_IMPL as RecorderKind) || 'native',
}: { children: React.ReactNode; impl?: RecorderKind; }) {
  const recorder = useMemo(() => desktop_recorder_factory(impl), [impl]);
  useEffect(() => { recorder.init(); }, [recorder]);
  return <RecorderCtx.Provider value={recorder}>{children}</RecorderCtx.Provider>;
}

export function useRecorder() {
  const ctx = useContext(RecorderCtx);
  if (!ctx) throw new Error('RecorderProvider missing');
  return ctx;
}

const generateRecordingId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export type VideoChunk = {
  blob: Blob;
  objectUrl?: string;
  durationMs: number;
  startMs: number;
  endMs: number;
  mimeType?: string;
  width?: number;
  height?: number;
  fps?: number;
  recordingId?: string;
  chunkIndex: number;
};

export type EmbeddedChunk = {
  chunk: VideoChunk;
  pooled: Float32Array;
  frames: ClipVideoEmbedding['frames'];
  suffix: number; // Identifier for the embedding method
};

export function useChunkedEmbeddingQueue(opts?: {
  chunkMs?: number;
  frameCount?: number;
  onEmbeddedChunk?: (r: EmbeddedChunk) => void | Promise<void>;
}) {
  const recorder = useRecorder();

  const chunkMs = opts?.chunkMs ?? (
    (import.meta as any).env?.VITE_VIDEO_CHUNK_MS
      ? Number((import.meta as any).env.VITE_VIDEO_CHUNK_MS)
      : 30_000
  );
  const frameCount = opts?.frameCount ?? (
    (import.meta as any).env?.VITE_VIDEO_SAMPLING_FRAMES
      ? Number((import.meta as any).env.VITE_VIDEO_SAMPLING_FRAMES)
      : 10
  );

  const onEmbeddedChunk = opts?.onEmbeddedChunk;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pending, setPending] = useState(0);
  const [processed, setProcessed] = useState(0);

  const queueRef = useRef<VideoChunk[]>([]);
  const processingRef = useRef(false);
  const stoppingRef = useRef(false);
  const recordingIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentStartRef = useRef<number | null>(null);

  const embedderRef = useRef<ClipVideoEmbedder | null>(null);

  const enqueue = (chunk: VideoChunk) => {
    queueRef.current.push(chunk);
    setPending(queueRef.current.length);
    // kick processing
    void processQueue();
  };

  const processQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    try {
      const embedder = embedderRef.current ?? (embedderRef.current = await ClipVideoEmbedder.get());
      while (queueRef.current.length > 0) {
        const chunk = queueRef.current.shift()!;
        setPending(queueRef.current.length);

        const { pooled, frames } = await embedder.embedVideo(chunk.blob, frameCount);
        setProcessed(v => v + 1);

        const suffix = 1; // Define current method

        try {
          await onEmbeddedChunk?.({ chunk, pooled, frames, suffix});
        } catch (e) {
          console.error('[upload:onEmbeddedChunk] failed:', e);
          // TODO: Implement retry policy when faided to upload 
        }
      }
    } catch (e) {
      console.error('[embedding] processQueue error:', e);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  };

  const rotateSegment = async () => {
    try {
      const startedAt = segmentStartRef.current!;
      const stopped = await recorder.stop();
      const now = Date.now();
      if (!recordingIdRef.current) {
        console.warn('[rotateSegment] missing recording id; dropping chunk');
        return;
      }
      const currentIndex = chunkIndexRef.current++;
      enqueue({
        blob: stopped.blob,
        objectUrl: stopped.objectUrl,
        durationMs: stopped.durationMs,
        startMs: startedAt,
        endMs: now,
        mimeType: stopped.mimeType,
        width: stopped.width,
        height: stopped.height,
        fps: stopped.fps,
        recordingId: recordingIdRef.current,
        chunkIndex: currentIndex,
      });

      if (!stoppingRef.current) {
        await recorder.start();
        segmentStartRef.current = now;
        timerRef.current = setTimeout(rotateSegment, chunkMs);
      }
    } catch (e) {
      console.error('[rotateSegment] failed:', e);
    }
  };

  const startChunked = async (recordingId?: string): Promise<string> => {
    stoppingRef.current = false;
    const id = recordingId ?? generateRecordingId();
    recordingIdRef.current = id;
    chunkIndexRef.current = 0;
    try {
      await recorder.start();
      segmentStartRef.current = Date.now();
      setIsRecording(true);
      timerRef.current = setTimeout(rotateSegment, chunkMs);
      return id;
    } catch (error) {
      recordingIdRef.current = null;
      chunkIndexRef.current = 0;
      stoppingRef.current = true;
      throw error;
    }
  };

  const stopChunked = async () => {
    stoppingRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    // last segment (when stopped)
    try {
      const startedAt = segmentStartRef.current;
      if (startedAt) {
        const stopped = await recorder.stop();
        const end = Date.now();
        if (!recordingIdRef.current) {
          console.warn('[stopChunked] missing recording id; dropping final chunk');
        } else {
          const currentIndex = chunkIndexRef.current++;
          enqueue({
            blob: stopped.blob,
            objectUrl: stopped.objectUrl,
            durationMs: stopped.durationMs,
            startMs: startedAt,
            endMs: end,
            mimeType: stopped.mimeType,
            width: stopped.width,
            height: stopped.height,
            fps: stopped.fps,
            recordingId: recordingIdRef.current,
            chunkIndex: currentIndex,
          });
        }
      }
    } catch (e) {
      console.error('[stopChunked] stop() failed:', e);
    } finally {
      segmentStartRef.current = null;
      recordingIdRef.current = null;
      setIsRecording(false);
      // process remaining chunks in queue
      await processQueue();
      chunkIndexRef.current = 0;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    startChunked,
    stopChunked,
    isRecording,
    isProcessing,
    pending,
    processed,
  };
}
