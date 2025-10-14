import type { BaseDesktopRecorder, SourceInfo } from './base';

export class RecallDesktopRecorder implements BaseDesktopRecorder {
  async init() { /* TODO: recall */ }
  async getSources?(): Promise<SourceInfo[]> { return []; }
  async start(): Promise<void> { throw new Error('Recall impl not yet available'); }
  async stop(): Promise<string | null> { return null; }
}
