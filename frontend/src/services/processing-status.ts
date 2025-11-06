export type ProcessingPhaseKey = 'searching' | 'processing' | 'generating';

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
  phase: ProcessingPhaseKey;
  startedAt: number;
}

export interface PhaseCompletedEvent {
  phase: ProcessingPhaseKey;
  elapsedMs: number;
  metrics?: PhaseMetrics;
}

export interface TokensStartedEvent {
  timestamp: number;
}

export interface ProcessingCompleteEvent {
  totalElapsedMs: number;
  phaseBreakdown: Record<ProcessingPhaseKey, number>;
  retrievalMetrics: RetrievalMetrics;
  completedAt: number;
}

export interface ProcessingErrorEvent {
  message: string;
  phase?: ProcessingPhaseKey;
  timestamp: number;
}

export interface ProcessingResetEvent {
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

  reset(): void {
    this.emit('processing-reset', { timestamp: now() });
  }

  startPhase(phase: ProcessingPhaseKey): void {
    this.emit('phase-started', { phase, startedAt: now() });
  }

  completePhase(phase: ProcessingPhaseKey, elapsedMs: number, metrics?: PhaseMetrics): void {
    this.emit('phase-completed', { phase, elapsedMs, metrics });
  }

  tokensStarted(): void {
    this.emit('tokens-started', { timestamp: now() });
  }

  completeProcessing(event: Omit<ProcessingCompleteEvent, 'completedAt'>): void {
    this.emit('processing-complete', {
      ...event,
      completedAt: now(),
    });
  }

  fail(message: string, phase?: ProcessingPhaseKey): void {
    this.emit('processing-error', {
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
