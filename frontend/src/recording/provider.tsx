import { createContext, useContext, useEffect, useMemo } from 'react';
import type { BaseDesktopRecorder } from './base';
import { desktop_recorder_factory, type RecorderKind } from './factory';

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
