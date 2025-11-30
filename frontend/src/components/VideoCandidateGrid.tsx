import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Video } from 'lucide-react';
import type { VideoCandidate } from '@/types/video';

interface VideoCandidateGridProps {
  videos: VideoCandidate[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onOpenVideo: (id: string) => void;
}

const PAGE_SIZE = 6;
const MAX_PAGES = 3;
const MAX_VISIBLE_VIDEOS = PAGE_SIZE * MAX_PAGES;

export function VideoCandidateGrid({
  videos,
  selectedIds,
  onToggleSelect,
  onOpenVideo,
}: VideoCandidateGridProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const limitedVideos = useMemo(
    () => videos.slice(0, MAX_VISIBLE_VIDEOS),
    [videos],
  );
  const totalPages = Math.min(
    Math.ceil(limitedVideos.length / PAGE_SIZE) || 1,
    MAX_PAGES,
  );
  const maxPageIndex = Math.max(totalPages - 1, 0);
  const clampedPage = Math.min(currentPage, maxPageIndex);
  const startIndex = clampedPage * PAGE_SIZE;
  const visibleVideos = limitedVideos.slice(startIndex, startIndex + PAGE_SIZE);
  const showPagination = limitedVideos.length > PAGE_SIZE;

  useEffect(() => {
    setCurrentPage(0);
  }, [limitedVideos.length]);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {visibleVideos.map(video => {
          const isSelected = selectedIds.includes(video.id);
          return (
            <button
              key={video.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggleSelect(video.id)}
              className={`relative overflow-hidden rounded-xl border bg-background/70 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected ? 'border-emerald-500 shadow-lg shadow-emerald-300/40' : 'border-border hover:border-primary/50'
              } cursor-pointer`}
            >
              <span className="sr-only">
                {isSelected ? 'Video selected' : 'Select this video'}
              </span>
              <div className="relative flex aspect-video items-center justify-center bg-black/80">
                {video.thumbnailUrl ? (
                  <video
                    src={video.thumbnailUrl}
                    muted
                    playsInline
                    loop
                    autoPlay
                    className="h-full w-full object-cover opacity-90"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
                    <Video className="h-6 w-6" />
                    <span className="text-xs mt-2">Preview unavailable</span>
                  </div>
                )}

                {isSelected ? (
                  <div className="absolute inset-0 bg-primary/20" aria-hidden="true" />
                ) : null}

                <span
                  role="button"
                  tabIndex={0}
                  onClick={event => {
                    event.stopPropagation();
                    onOpenVideo(video.id);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenVideo(video.id);
                    }
                  }}
                  className="absolute right-2 top-2 inline-flex cursor-pointer rounded-full bg-black/70 p-1 text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open video preview"
                >
                  <Maximize2 className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {showPagination ? (
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 0))}
            disabled={clampedPage === 0}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              clampedPage === 0
                ? 'cursor-not-allowed border-border text-muted-foreground/50'
                : 'border-border hover:border-primary hover:text-primary'
            }`}
          >
            Previous
          </button>
          <span className="font-medium text-foreground">
            Page {clampedPage + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, maxPageIndex))}
            disabled={clampedPage === maxPageIndex}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              clampedPage === maxPageIndex
                ? 'cursor-not-allowed border-border text-muted-foreground/50'
                : 'border-border hover:border-primary hover:text-primary'
            }`}
          >
            Next
          </button>
        </div>
      ) : null}
    </>
  );
}
