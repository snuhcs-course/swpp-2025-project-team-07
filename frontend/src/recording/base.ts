export type RecordingResult = {
  blob: Blob;                 // original recorded data
  mimeType: string;           // ex: "video/webm;codecs=vp9"
  durationMs: number;         // recording duration
  width: number;
  height: number;
  fps?: number;
  startedAt: number;
  endedAt: number;
  objectUrl?: string;         // for preview
};

export interface BaseDesktopRecorder {
  init(): Promise<void> | void;
  start(opts?: { sourceId?: string; withAudio?: boolean }): Promise<void>;
  stop(): Promise<RecordingResult>;

  getSources?: () => Promise<Array<{ id: string; name: string; thumbnailURL?: string }>>;
  chooseSource?: (sourceId: string) => Promise<void>;

}