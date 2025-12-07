import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface VideoPlayerModalProps {
  open: boolean;
  videoUrl: string | null;
  title?: string;
  sequence?: Array<{ id: string; url?: string; order?: number }>;
  onClose: () => void;
}

export function VideoPlayerModal({ open, videoUrl, title, sequence = [], onClose }: VideoPlayerModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    setActiveIndex(0);
  }, [videoUrl, sequence?.length]);

  const orderedSequence = [...sequence].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasSequence = orderedSequence.length > 1;
  const currentVideoUrl = hasSequence
    ? orderedSequence[Math.min(activeIndex, orderedSequence.length - 1)]?.url ?? videoUrl
    : videoUrl;

  const handleNext = () => {
    setActiveIndex((prev) => Math.min(prev + 1, orderedSequence.length - 1));
  };

  const handlePrev = () => {
    setActiveIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <AnimatePresence>
      {open && currentVideoUrl ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-3xl rounded-2xl bg-background shadow-2xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close video preview"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col gap-4 p-5">
              {title ? (
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
              ) : (
                <span className="text-sm font-medium text-muted-foreground">Video preview</span>
              )}
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <video
                  key={currentVideoUrl}
                  src={currentVideoUrl}
                  controls
                  autoPlay
                  onEnded={() => {
                    if (hasSequence && activeIndex < orderedSequence.length - 1) {
                      handleNext();
                    }
                  }}
                  className="h-[420px] w-full rounded-xl object-contain bg-black"
                />
              </div>
              {hasSequence ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-secondary/70 px-2 py-1">
                      Clip {activeIndex + 1} of {orderedSequence.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrev}
                      disabled={activeIndex === 0}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium transition disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={activeIndex >= orderedSequence.length - 1}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium transition disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
