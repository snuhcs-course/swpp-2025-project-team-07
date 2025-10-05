export type SourceInfo = { id: string; name: string; thumbnailDataUrl?: string | null };

export interface BaseDesktopRecorder {
  init(): Promise<void>;
  getSources?(): Promise<SourceInfo[]>;
  chooseSource?(id: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<string | null>; 
}
