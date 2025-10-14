import type { BaseDesktopRecorder, SourceInfo } from './base';

declare global {
  interface Window {
    recorder: {
      listSources: () => Promise<SourceInfo[]>;
      chooseSource: (id: string) => Promise<void>;
      start: () => Promise<void>;
      stop: () => Promise<void>;
    };
  }
}

export class NativeDesktopRecorder implements BaseDesktopRecorder {
  async init() { /* 필요없으면 빈칸 */ }

  async getSources(): Promise<SourceInfo[]> {
    return window.recorder.listSources();
  }
  async chooseSource(id: string) {
    await window.recorder.chooseSource(id);
  }
  async start() {
    await window.recorder.start();
  }
  async stop(): Promise<string | null> {
    // 현재 preload에서는 저장 후 경로를 send로만 쏘고 있으면 null일 수 있음.
    // 저장 경로를 받으려면 preload에서 invoke 반환값을 받도록 확장해도 됨.
    await window.recorder.stop();
    return null;
  }
}
