import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  processingStatusService,
  type ProcessingCompleteEvent,
  type ProcessingErrorEvent,
  type ProcessingPhaseKey,
  type RetrievalMetrics,
} from '@/services/processing-status';

interface ChatStatusIndicatorsProps {
  onToggleDetails?: (expanded: boolean) => void;
}

type PhaseState = 'upcoming' | 'active' | 'complete';

const PHASE_ORDER: ProcessingPhaseKey[] = ['searching', 'processing', 'generating'];

const PHASE_CONFIG: Record<
  ProcessingPhaseKey,
  { label: string; emoji: string; accent: string; mutedAccent: string; description: string }
> = {
  searching: {
    label: 'Searching your memories...',
    emoji: '🔍',
    accent: 'bg-blue-500/15 border-blue-400/40 text-blue-500',
    mutedAccent: 'border-blue-500/10 text-muted-foreground',
    description: 'Encrypted memory retrieval in progress',
  },
  processing: {
    label: 'Processing securely...',
    emoji: '🔐',
    accent: 'bg-purple-500/15 border-purple-400/40 text-purple-500',
    mutedAccent: 'border-purple-500/10 text-muted-foreground',
    description: 'Encrypting and preparing retrieved data',
  },
  generating: {
    label: 'Generating response...',
    emoji: '✨',
    accent: 'bg-amber-500/15 border-amber-400/40 text-amber-600',
    mutedAccent: 'border-amber-500/10 text-muted-foreground',
    description: 'Crafting the final answer with retrieved context',
  },
};

const DEFAULT_METRICS: RetrievalMetrics = {
  memoriesRetrieved: 0,
  encryptedDataProcessed: false,
  screenRecordings: 0,
  embeddingsSearched: 0,
};

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const formatMs = (value: number): string => `${(value / 1000).toFixed(1)}s`;

const mergeRetrievalMetrics = (
  base: RetrievalMetrics,
  patch?: Partial<RetrievalMetrics>
): RetrievalMetrics => ({
  memoriesRetrieved:
    patch?.memoriesRetrieved !== undefined ? patch.memoriesRetrieved : base.memoriesRetrieved,
  encryptedDataProcessed:
    patch?.encryptedDataProcessed !== undefined
      ? patch.encryptedDataProcessed
      : base.encryptedDataProcessed,
  screenRecordings:
    patch?.screenRecordings !== undefined ? patch.screenRecordings : base.screenRecordings,
  embeddingsSearched:
    patch?.embeddingsSearched !== undefined ? patch.embeddingsSearched : base.embeddingsSearched,
});

export function ChatStatusIndicators({ onToggleDetails }: ChatStatusIndicatorsProps) {
  const [phaseStartTimes, setPhaseStartTimes] = useState<Record<ProcessingPhaseKey, number | null>>({
    searching: null,
    processing: null,
    generating: null,
  });
  const [phaseTimings, setPhaseTimings] = useState<Record<ProcessingPhaseKey, number>>({
    searching: 0,
    processing: 0,
    generating: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePhase, setActivePhase] = useState<ProcessingPhaseKey | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [retrievalMetrics, setRetrievalMetrics] = useState<RetrievalMetrics>(DEFAULT_METRICS);
  const [securityMessages, setSecurityMessages] = useState<string[]>([]);
  const [summary, setSummary] = useState<ProcessingCompleteEvent | null>(null);
  const [errorState, setErrorState] = useState<ProcessingErrorEvent | null>(null);
  const [tick, setTick] = useState(() => now());
  const [isRendered, setIsRendered] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const summaryFadeTimeoutRef = useRef<number | null>(null);
  const summaryHideTimeoutRef = useRef<number | null>(null);
  const idleHideTimeoutRef = useRef<number | null>(null);

  const clearTimeoutRef = (ref: { current: number | null }) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const clearAllTimers = () => {
    clearTimeoutRef(summaryFadeTimeoutRef);
    clearTimeoutRef(summaryHideTimeoutRef);
    clearTimeoutRef(idleHideTimeoutRef);
  };

  useEffect(() => {
    if (activePhase) {
      const interval = window.setInterval(() => setTick(now()), 100);
      return () => window.clearInterval(interval);
    }

    return undefined;
  }, [activePhase]);

  useEffect(() => () => clearAllTimers(), []);

  useEffect(() => {
    const offReset = processingStatusService.on('processing-reset', () => {
      setPhaseStartTimes({ searching: null, processing: null, generating: null });
      setPhaseTimings({ searching: 0, processing: 0, generating: 0 });
      setActivePhase(null);
      setIsProcessing(false);
      setSummary(null);
      setErrorState(null);
      setRetrievalMetrics(DEFAULT_METRICS);
      setSecurityMessages([]);
      setDetailsExpanded(false);
      setIsRendered(false);
      setIsFadingOut(false);
      clearAllTimers();
    });

    const offStarted = processingStatusService.on('phase-started', ({ phase, startedAt }) => {
      setIsProcessing(true);
      setActivePhase(phase);
      setPhaseStartTimes(prev => ({ ...prev, [phase]: startedAt }));
      setPhaseTimings(prev => ({ ...prev, [phase]: 0 }));
      setSummary(null);
      setErrorState(null);
      setSecurityMessages([]);
      setIsRendered(true);
      setIsFadingOut(false);
      clearAllTimers();
    });

    const offCompleted = processingStatusService.on('phase-completed', ({ phase, elapsedMs, metrics }) => {
      setPhaseTimings(prev => ({ ...prev, [phase]: elapsedMs }));
      setPhaseStartTimes(prev => ({ ...prev, [phase]: null }));
      setActivePhase(prev => (prev === phase ? null : prev));

      if (metrics?.retrievalMetrics) {
        setRetrievalMetrics(prev => mergeRetrievalMetrics(prev, metrics.retrievalMetrics));
      }

      if (metrics?.securityMessages?.length) {
        setSecurityMessages(prev => {
          const next = new Set(prev);
          metrics.securityMessages!.forEach(message => next.add(message));
          return Array.from(next);
        });
      }
    });

    const offComplete = processingStatusService.on('processing-complete', payload => {
      setIsProcessing(false);
      setActivePhase(null);
      setPhaseStartTimes({ searching: null, processing: null, generating: null });
      setSummary(payload);
      setRetrievalMetrics(payload.retrievalMetrics);
    });

    const offError = processingStatusService.on('processing-error', payload => {
      setIsProcessing(false);
      setActivePhase(null);
      setPhaseStartTimes({ searching: null, processing: null, generating: null });
      setErrorState(payload);
      setIsRendered(true);
      setIsFadingOut(false);
      clearAllTimers();
    });

    return () => {
      offReset();
      offStarted();
      offCompleted();
      offComplete();
      offError();
    };
  }, []);

  useEffect(() => {
    if (isProcessing || errorState) {
      clearAllTimers();
      setIsRendered(true);
      setIsFadingOut(false);
      return;
    }

    if (summary) {
      clearAllTimers();
      setIsRendered(true);
      setIsFadingOut(false);

      summaryFadeTimeoutRef.current = window.setTimeout(() => {
        setIsFadingOut(true);
      }, 1600);

      summaryHideTimeoutRef.current = window.setTimeout(() => {
        setIsRendered(false);
        setSummary(null);
        setDetailsExpanded(false);
        setSecurityMessages([]);
      }, 2100);

      return;
    }

    if (!isProcessing && !errorState && !summary && isRendered) {
      clearAllTimers();
      setIsFadingOut(true);

      idleHideTimeoutRef.current = window.setTimeout(() => {
        setIsRendered(false);
        setDetailsExpanded(false);
        setSecurityMessages([]);
      }, 240);
    }
  }, [isProcessing, summary, errorState, isRendered]);

  const phaseStates = useMemo<Record<ProcessingPhaseKey, PhaseState>>(() => {
    return PHASE_ORDER.reduce((acc, phase) => {
      if (phaseStartTimes[phase] !== null) {
        acc[phase] = 'active';
      } else if (phaseTimings[phase] > 0) {
        acc[phase] = 'complete';
      } else {
        acc[phase] = 'upcoming';
      }
      return acc;
    }, {} as Record<ProcessingPhaseKey, PhaseState>);
  }, [phaseStartTimes, phaseTimings]);

  if (!isRendered) {
    return null;
  }

  const handleToggleDetails = () => {
    setDetailsExpanded(prev => {
      const next = !prev;
      onToggleDetails?.(next);
      return next;
    });
  };

  const renderPhase = (phase: ProcessingPhaseKey) => {
    const config = PHASE_CONFIG[phase];
    const state = phaseStates[phase];
    const start = phaseStartTimes[phase];
    const elapsedMs = start !== null ? Math.max(tick - start, 0) : phaseTimings[phase];
    const timeLabel = state === 'upcoming' && elapsedMs === 0 ? '—' : formatMs(elapsedMs);

    const baseClasses =
      'rounded-lg border px-3 py-2 transition-all duration-300 ease-out flex items-center justify-between gap-3';
    const accentClass =
      state === 'active'
        ? config.accent
        : state === 'complete'
          ? `${config.mutedAccent} bg-muted/40`
          : `${config.mutedAccent} bg-muted/20 opacity-60`;

    return (
      <motion.div
        key={phase}
        layout
        initial={{ opacity: 0.4, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`${baseClasses} ${accentClass}`}
      >
        <div className="flex flex-col">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden>{config.emoji}</span>
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground">{config.description}</span>
        </div>

        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{timeLabel}</span>
          {state === 'active' ? (
            <span
              className="inline-flex h-3.5 w-3.5 items-center justify-center"
              aria-hidden
            >
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-current border-t-transparent" />
            </span>
          ) : state === 'complete' ? (
            <span aria-hidden className="text-emerald-500">
              ✓
            </span>
          ) : (
            <span aria-hidden className="text-muted-foreground">
              •
            </span>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={isFadingOut ? { opacity: 0, y: 12 } : { opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3 }}
      role="status"
      aria-live="polite"
      className="z-10 mx-auto w-full max-w-2xl rounded-xl border border-border/60 bg-background/95 p-4 shadow-lg shadow-black/5 backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {errorState ? (
            <>
              <span className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <span aria-hidden>⚠️</span>
                Secure processing interrupted
              </span>
              <span className="text-xs text-muted-foreground">
                {errorState.message}
              </span>
            </>
          ) : summary ? (
            <>
              <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <span aria-hidden>✓</span>
                Response generated securely
              </span>
              <span className="text-xs text-muted-foreground">
                Total processing time {formatMs(summary.totalElapsedMs)}
              </span>
            </>
          ) : (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Real-time processing
              </span>
              <span className="text-sm text-muted-foreground">
                Follow Clone’s secure workflow while we craft your answer.
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleToggleDetails}
          className="text-xs font-medium text-primary underline-offset-4 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md px-2 py-1"
          aria-expanded={detailsExpanded}
          aria-controls="chat-status-details"
        >
          {detailsExpanded ? 'Hide details' : 'Show details'}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {PHASE_ORDER.map(renderPhase)}
      </div>

      {detailsExpanded && (
        <motion.div
          id="chat-status-details"
          layout
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-4 space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Retrieval insights
            </span>
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                Retrieved{' '}
                <strong className="font-semibold text-foreground">
                  {retrievalMetrics.memoriesRetrieved}
                </strong>{' '}
                memories
              </span>
              <span>
                Screen captures:{' '}
                <strong className="font-semibold text-foreground">
                  {retrievalMetrics.screenRecordings ?? 0}
                </strong>
              </span>
              {retrievalMetrics.embeddingsSearched !== undefined && (
                <span>
                  Embeddings searched:{' '}
                  <strong className="font-semibold text-foreground">
                    {retrievalMetrics.embeddingsSearched}
                  </strong>
                </span>
              )}
              <span>
                Encryption:{' '}
                <strong className="font-semibold text-foreground">
                  {retrievalMetrics.encryptedDataProcessed ? 'Active' : 'Pending'}
                </strong>
              </span>
            </div>
          </div>

          {securityMessages.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Security confirmations
              </span>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {securityMessages.map(message => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          {(summary || isProcessing) && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Latency breakdown
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PHASE_ORDER.map(phase => {
                  const label = PHASE_CONFIG[phase].label;
                  const start = phaseStartTimes[phase];
                  const elapsed = summary
                    ? summary.phaseBreakdown[phase]
                    : start !== null
                      ? Math.max(tick - start, 0)
                      : phaseTimings[phase];

                  return (
                    <div
                      key={`breakdown-${phase}`}
                      className="rounded-md border border-border/60 bg-background/70 p-2 text-xs"
                    >
                      <div className="font-medium text-foreground">
                        {PHASE_CONFIG[phase].emoji}{' '}
                        {label.replace(/\.\.\.$/, '')}
                      </div>
                      <div className="text-muted-foreground">
                        {formatMs(elapsed)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.section>
  );
}
