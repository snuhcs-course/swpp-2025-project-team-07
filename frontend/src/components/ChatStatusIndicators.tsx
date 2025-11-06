import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  processingStatusService,
  type ProcessingErrorEvent,
  type ProcessingPhaseKey,
} from '@/services/processing-status';

const PHASE_CONFIG: Record<
  ProcessingPhaseKey,
  { label: string; emoji: string; accent: string; description: string }
> = {
  searching: {
    label: 'Searching your memories...',
    emoji: '🔍',
    accent: 'border-blue-400/40 text-blue-500',
    description: 'Encrypted recall in progress',
  },
  processing: {
    label: 'Processing securely...',
    emoji: '🔐',
    accent: 'border-purple-400/40 text-purple-500',
    description: 'All data stays encrypted end-to-end',
  },
  generating: {
    label: 'Thinking about the best response for you...',
    emoji: '✨',
    accent: 'border-amber-400/40 text-amber-500',
    description: 'Carefully combining context into a reply',
  },
};

const HIDE_TRANSITION_MS = 220;

export function ChatStatusIndicators() {
  const [currentPhase, setCurrentPhase] = useState<ProcessingPhaseKey | null>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [errorState, setErrorState] = useState<ProcessingErrorEvent | null>(null);

  const hideTimeoutRef = useRef<number | null>(null);

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current !== null) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const triggerHide = () => {
    clearHideTimeout();
    setIsFadingOut(true);
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsRendered(false);
      setIsFadingOut(false);
      setCurrentPhase(null);
      setErrorState(null);
      hideTimeoutRef.current = null;
    }, HIDE_TRANSITION_MS);
  };

  useEffect(() => () => clearHideTimeout(), []);

  useEffect(() => {
    const offReset = processingStatusService.on('processing-reset', () => {
      triggerHide();
    });

    const offStarted = processingStatusService.on('phase-started', ({ phase }) => {
      clearHideTimeout();
      setErrorState(null);
      setCurrentPhase(phase);
      setIsRendered(true);
      setIsFadingOut(false);
    });

    const offTokensStarted = processingStatusService.on('tokens-started', () => {
      triggerHide();
    });

    const offProcessingComplete = processingStatusService.on('processing-complete', () => {
      triggerHide();
    });

    const offError = processingStatusService.on('processing-error', payload => {
      clearHideTimeout();
      setCurrentPhase(null);
      setErrorState(payload);
      setIsRendered(true);
      setIsFadingOut(false);
    });

    return () => {
      offReset();
      offStarted();
      offTokensStarted();
      offProcessingComplete();
      offError();
    };
  }, []);

  if (!isRendered && !errorState) {
    return null;
  }

  const isError = Boolean(errorState);
  const phaseConfig = currentPhase ? PHASE_CONFIG[currentPhase] : null;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={isFadingOut ? { opacity: 0, y: 12 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      role="status"
      aria-live={isError ? 'assertive' : 'polite'}
      className="max-w-xl rounded-xl px-4 py-3"
    >
      {isError && errorState ? (
        <div className="flex items-center gap-3 text-destructive">
          <span aria-hidden className="text-lg leading-none">
            ⚠️
          </span>
          <span className="text-sm font-semibold">
            Secure processing interrupted: {errorState.message}
          </span>
        </div>
      ) : phaseConfig ? (
        <motion.div
          key={phaseConfig.label}
          layout
          initial={{ opacity: 0.4, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${phaseConfig.accent}`}
        >
          <div className="flex items-center gap-3">
            <span aria-hidden className="text-lg leading-none">
              {phaseConfig.emoji}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{phaseConfig.label}</span>
              <span className="text-xs text-muted-foreground">{phaseConfig.description}</span>
            </div>
          </div>
          <span
            className="inline-flex h-5 w-5 items-center justify-center text-current"
            aria-hidden
          >
            <span className="h-5 w-5 animate-spin rounded-full border-[2px] border-current border-t-transparent" />
          </span>
        </motion.div>
      ) : null}
    </motion.section>
  );
}
