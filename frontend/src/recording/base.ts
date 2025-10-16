export type RecordingResult = {
  blob: Blob;                 // 원본 비디오 데이터 (메모리)
  mimeType: string;           // 예: "video/webm;codecs=vp9"
  durationMs: number;         // 녹화 시간
  width: number;
  height: number;
  fps?: number;
  startedAt: number;
  endedAt: number;
  objectUrl?: string;         // 미리보기용 (URL.revokeObjectURL로 해제 필요)
};

export interface BaseDesktopRecorder {
  init(): Promise<void> | void;
  start(opts?: { sourceId?: string; withAudio?: boolean }): Promise<void>;
  stop(): Promise<RecordingResult>;

  // 선택 API (있으면 ChatHeader가 사용함)
  getSources?: () => Promise<Array<{ id: string; name: string; thumbnailURL?: string }>>;
  chooseSource?: (sourceId: string) => Promise<void>;
}