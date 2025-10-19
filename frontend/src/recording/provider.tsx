import { createContext, useContext, useEffect, useMemo } from 'react';
import type { BaseDesktopRecorder } from './base';
import { desktop_recorder_factory, type RecorderKind } from './factory';
import { ClipVideoEmbedder } from '@/embedding/ClipVideoEmbedder';

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

// stop recording and embed video frames
export function useRecorderWithEmbed() {
  const recorder = useRecorder();

  const stopAndEmbed = async (frameCount: number = (
    (import.meta as any).env?.VITE_VIDEO_SAMPLING_FRAMES
      ? Number((import.meta as any).env.VITE_VIDEO_SAMPLING_FRAMES)
      : 10
  )) => {
    // 1) stop recording and get recording blob
    const recording = await recorder.stop();

    // 2) load embedder and embed video frames
    const embedder = await ClipVideoEmbedder.get();
    const embedding = await embedder.embedVideo(recording.blob, frameCount);

    // 3) return both recording and embedding
    return { recording, embedding };
  };

  return { recorder, stopAndEmbed };
}
