export interface VideoCandidate {
  id: string;
  thumbnailUrl: string;
  videoUrl: string;
  score: number;
  videoBlob?: Blob;
  durationMs?: number;
  timestamp?: number;
  title?: string;
  videoSetId?: string | null;
  representativeId?: string;
  sequenceLength?: number;
  sequence?: Array<{
    id: string;
    url?: string;
    order?: number;
    durationMs?: number;
    timestamp?: number;
  }>;
}

export type SelectedVideoId = VideoCandidate['id'];
