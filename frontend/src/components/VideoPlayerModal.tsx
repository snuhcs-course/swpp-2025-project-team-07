import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface VideoPlayerModalProps {
  open: boolean;
  videoUrl: string | null;
  title?: string;
  onClose: () => void;
}

export function VideoPlayerModal({ open, videoUrl, title, onClose }: VideoPlayerModalProps) {
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

  return (
    <AnimatePresence>
      {open && videoUrl ? (
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
                  src={videoUrl}
                  controls
                  autoPlay
                  className="h-[420px] w-full rounded-xl object-contain bg-black"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
