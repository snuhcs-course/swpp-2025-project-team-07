import { useCallback, useEffect, useRef, useState } from 'react';
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
  understanding: {
    label: 'Understanding your request...',
    emoji: '🤔',
    accent: 'border-lime-400/40 text-lime-500',
    description: 'Analyzing the requirements for the video search',
  },
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
    description: 'Carefully combining context into a response',
  },
};

const HIDE_TRANSITION_MS = 220;

type SessionIndicatorState = {
  currentPhase: ProcessingPhaseKey | null;
  isRendered: boolean;
  isFadingOut: boolean;
  errorState: ProcessingErrorEvent | null;
};

const createInitialState = (): SessionIndicatorState => ({
  currentPhase: null,
  isRendered: false,
  isFadingOut: false,
  errorState: null,
});

interface ChatStatusIndicatorsProps {
  sessionId: string | null;
}

export function ChatStatusIndicators({ sessionId }: ChatStatusIndicatorsProps) {
  const [displayState, setDisplayState] = useState<SessionIndicatorState>(createInitialState);
  const sessionStatesRef = useRef<Map<string, SessionIndicatorState>>(new Map());
  const hideTimeoutsRef = useRef<Map<string, number>>(new Map());
  const activeSessionIdRef = useRef<string | null>(sessionId ?? null);

  useEffect(() => {
    activeSessionIdRef.current = sessionId ?? null;

    if (!sessionId) {
      setDisplayState(createInitialState());
      return;
    }

    const storedState = sessionStatesRef.current.get(sessionId);
    if (storedState) {
      setDisplayState(storedState);
    } else {
      const initialState = createInitialState();
      sessionStatesRef.current.set(sessionId, initialState);
      setDisplayState(initialState);
    }
  }, [sessionId]);

  useEffect(
    () => () => {
      hideTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      hideTimeoutsRef.current.clear();
    },
    [],
  );

  const commitSessionState = useCallback(
    (targetSessionId: string, nextState: SessionIndicatorState) => {
      sessionStatesRef.current.set(targetSessionId, nextState);
      if (activeSessionIdRef.current === targetSessionId) {
        setDisplayState(nextState);
      }
    },
    [],
  );

  const updateSessionState = useCallback(
    (targetSessionId: string, updater: (prev: SessionIndicatorState) => SessionIndicatorState) => {
      const previousState = sessionStatesRef.current.get(targetSessionId) ?? createInitialState();
      const nextState = updater(previousState);
      commitSessionState(targetSessionId, nextState);
    },
    [commitSessionState],
  );

  const clearHideTimeout = useCallback((targetSessionId: string) => {
    const timeoutId = hideTimeoutsRef.current.get(targetSessionId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      hideTimeoutsRef.current.delete(targetSessionId);
    }
  }, []);

  const triggerHide = useCallback(
    (targetSessionId: string) => {
      const previousState = sessionStatesRef.current.get(targetSessionId) ?? createInitialState();

      if (!previousState.isRendered && !previousState.errorState) {
        const resetState = createInitialState();
        commitSessionState(targetSessionId, resetState);
        clearHideTimeout(targetSessionId);
        return;
      }

      clearHideTimeout(targetSessionId);

      const fadingState: SessionIndicatorState = {
        ...previousState,
        isFadingOut: true,
      };
      commitSessionState(targetSessionId, fadingState);

      const timeoutId = window.setTimeout(() => {
        const resetState = createInitialState();
        commitSessionState(targetSessionId, resetState);
        hideTimeoutsRef.current.delete(targetSessionId);
      }, HIDE_TRANSITION_MS);

      hideTimeoutsRef.current.set(targetSessionId, timeoutId);
    },
    [clearHideTimeout, commitSessionState],
  );

  useEffect(() => {
    const offReset = processingStatusService.on('processing-reset', ({ sessionId: targetSessionId }) => {
      triggerHide(targetSessionId);
    });

    const offStarted = processingStatusService.on('phase-started', ({ sessionId: targetSessionId, phase }) => {
      clearHideTimeout(targetSessionId);
      updateSessionState(targetSessionId, () => ({
        currentPhase: phase,
        isRendered: true,
        isFadingOut: false,
        errorState: null,
      }));
    });

    const offTokensStarted = processingStatusService.on('tokens-started', ({ sessionId: targetSessionId }) => {
      triggerHide(targetSessionId);
    });

    const offProcessingComplete = processingStatusService.on('processing-complete', ({
      sessionId: targetSessionId,
    }) => {
      triggerHide(targetSessionId);
    });

    const offError = processingStatusService.on('processing-error', payload => {
      const targetSessionId = payload.sessionId;
      clearHideTimeout(targetSessionId);
      updateSessionState(targetSessionId, () => ({
        currentPhase: null,
        isRendered: true,
        isFadingOut: false,
        errorState: payload,
      }));
    });

    return () => {
      offReset();
      offStarted();
      offTokensStarted();
      offProcessingComplete();
      offError();
    };
  }, [clearHideTimeout, triggerHide, updateSessionState]);

  const { currentPhase, isRendered, isFadingOut, errorState } = displayState;

  if (!sessionId || (!isRendered && !errorState)) {
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

interface StopIndicatorProps {
  isStopping?: boolean;
}

export function StopIndicator({ isStopping = false }: StopIndicatorProps) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      role="status"
      aria-live="assertive"
      className="max-w-xl rounded-xl px-4 py-3"
    >
      <motion.div
        layout
        initial={{ opacity: 0.4, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 border-red-400/40 text-red-500"
      >
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-lg leading-none">
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">
              {isStopping ? 'Stopping response...' : 'Response stopped'}
            </span>
            <span className="text-xs text-muted-foreground">
              {isStopping ? 'Finishing up with the model—almost done.' : 'You can send a new one.'}
            </span>
          </div>
        </div>
        {isStopping && (
          <span className="inline-flex h-5 w-5 items-center justify-center text-current" aria-hidden>
            <span className="h-5 w-5 animate-spin rounded-full border-[2px] border-current border-t-transparent" />
          </span>
        )}
      </motion.div>
    </motion.section>
  );
}
