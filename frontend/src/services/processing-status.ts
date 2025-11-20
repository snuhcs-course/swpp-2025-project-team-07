export type ProcessingPhaseKey = 'understanding' | 'searching' | 'processing' | 'generating';

export type ProcessingPhase = ProcessingPhaseKey | 'complete';

export interface RetrievalMetrics {
  memoriesRetrieved: number;
  encryptedDataProcessed: boolean;
  screenRecordings?: number;
  embeddingsSearched?: number;
}

export interface PhaseMetrics {
  retrievalMetrics?: Partial<RetrievalMetrics>;
  securityMessages?: string[];
  generatedChunks?: number;
  generatedCharacters?: number;
}

export interface PhaseStartedEvent {
  sessionId: string;
  phase: ProcessingPhaseKey;
  startedAt: number;
}

export interface PhaseCompletedEvent {
  sessionId: string;
  phase: ProcessingPhaseKey;
  elapsedMs: number;
  metrics?: PhaseMetrics;
}

export interface TokensStartedEvent {
  sessionId: string;
  timestamp: number;
}

export interface ProcessingCompleteEvent {
  sessionId: string;
  totalElapsedMs: number;
  phaseBreakdown: Record<ProcessingPhaseKey, number>;
  retrievalMetrics: RetrievalMetrics;
  completedAt: number;
}

export interface ProcessingErrorEvent {
  sessionId: string;
  message: string;
  phase?: ProcessingPhaseKey;
  timestamp: number;
}

export interface ProcessingResetEvent {
  sessionId: string;
  timestamp: number;
}

type StatusEventPayloads = {
  'phase-started': PhaseStartedEvent;
  'phase-completed': PhaseCompletedEvent;
  'tokens-started': TokensStartedEvent;
  'processing-complete': ProcessingCompleteEvent;
  'processing-error': ProcessingErrorEvent;
  'processing-reset': ProcessingResetEvent;
};

export type ProcessingStatusEvent = keyof StatusEventPayloads;

type Listener<K extends ProcessingStatusEvent> = (payload: StatusEventPayloads[K]) => void;

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

class ProcessingStatusService {
  private static instance: ProcessingStatusService;

  private listeners: {
    [K in ProcessingStatusEvent]: Set<Listener<K>>;
  };

  private constructor() {
    this.listeners = {
      'phase-started': new Set(),
      'phase-completed': new Set(),
      'tokens-started': new Set(),
      'processing-complete': new Set(),
      'processing-error': new Set(),
      'processing-reset': new Set(),
    };
  }

  static getInstance(): ProcessingStatusService {
    if (!ProcessingStatusService.instance) {
      ProcessingStatusService.instance = new ProcessingStatusService();
    }
    return ProcessingStatusService.instance;
  }

  on<K extends ProcessingStatusEvent>(event: K, handler: Listener<K>): () => void {
    this.listeners[event].add(handler);
    return () => this.off(event, handler);
  }

  off<K extends ProcessingStatusEvent>(event: K, handler: Listener<K>): void {
    this.listeners[event].delete(handler);
  }

  reset(sessionId: string): void {
    this.emit('processing-reset', { sessionId, timestamp: now() });
  }

  startPhase(sessionId: string, phase: ProcessingPhaseKey): void {
    this.emit('phase-started', { sessionId, phase, startedAt: now() });
  }

  completePhase(
    sessionId: string,
    phase: ProcessingPhaseKey,
    elapsedMs: number,
    metrics?: PhaseMetrics,
  ): void {
    this.emit('phase-completed', { sessionId, phase, elapsedMs, metrics });
  }

  tokensStarted(sessionId: string): void {
    this.emit('tokens-started', { sessionId, timestamp: now() });
  }

  completeProcessing(
    sessionId: string,
    event: Omit<ProcessingCompleteEvent, 'completedAt' | 'sessionId'>,
  ): void {
    this.emit('processing-complete', {
      sessionId,
      ...event,
      completedAt: now(),
    });
  }

  fail(sessionId: string, message: string, phase?: ProcessingPhaseKey): void {
    this.emit('processing-error', {
      sessionId,
      message,
      phase,
      timestamp: now(),
    });
  }

  private emit<K extends ProcessingStatusEvent>(event: K, payload: StatusEventPayloads[K]): void {
    for (const listener of this.listeners[event]) {
      listener(payload);
    }
  }
}

export const processingStatusService = ProcessingStatusService.getInstance();
