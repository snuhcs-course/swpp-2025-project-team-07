import type { BaseDesktopRecorder, SourceInfo } from './base';

export class OWADesktopRecorder implements BaseDesktopRecorder {
  async init() { /* TODO: connect OWA recorder bridge */ }
  async getSources?(): Promise<SourceInfo[]> { return []; }
  async start(): Promise<void> { throw new Error('OWA impl not yet available'); }
  async stop(): Promise<string | null> { return null; }
}
