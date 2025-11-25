export interface VideoCandidate {
  id: string;
  thumbnailUrl: string;
  videoUrl: string;
  score: number;
  videoBlob?: Blob;
  durationMs?: number;
  timestamp?: number;
  title?: string;
}

export type SelectedVideoId = VideoCandidate['id'];
