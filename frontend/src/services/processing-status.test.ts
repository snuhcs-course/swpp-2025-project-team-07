import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processingStatusService } from '@/services/processing-status';
import type {
  ProcessingPhaseKey,
  PhaseMetrics,
  RetrievalMetrics,
} from '@/services/processing-status';

describe('ProcessingStatusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should export a processingStatusService singleton instance', () => {
      expect(processingStatusService).toBeDefined();
      expect(typeof processingStatusService.on).toBe('function');
      expect(typeof processingStatusService.off).toBe('function');
      expect(typeof processingStatusService.reset).toBe('function');
    });
  });

  describe('Event Listener Registration (on)', () => {
    it('should register a listener for phase-started events', () => {
      const listener = vi.fn();
      const unsubscribe = processingStatusService.on('phase-started', listener);

      processingStatusService.startPhase('test-session', 'searching');

      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session',
          phase: 'searching',
          startedAt: expect.any(Number),
        })
      );

      unsubscribe();
    });

    it('should register a listener for phase-completed events', () => {
      const listener = vi.fn();
      const unsubscribe = processingStatusService.on('phase-completed', listener);

      processingStatusService.completePhase('test-session', 'processing', 100);

      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session',
          phase: 'processing',
          elapsedMs: 100,
        })
      );

      unsubscribe();
    });

    it('should register a listener for processing-complete events', () => {
      const listener = vi.fn();
      const unsubscribe = processingStatusService.on('processing-complete', listener);

      processingStatusService.completeProcessing('test-session', {
        totalElapsedMs: 1000,
        phaseBreakdown: {
          searching: 300,
          processing: 400,
          generating: 300,
        },
        retrievalMetrics: {
          memoriesRetrieved: 5,
          encryptedDataProcessed: true,
        },
      });

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('Event Listener Removal (off)', () => {
    it('should remove a registered listener', () => {
      const listener = vi.fn();
      processingStatusService.on('phase-started', listener);

      processingStatusService.off('phase-started', listener);
      processingStatusService.startPhase('test-session', 'searching');

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not throw when removing a listener that does not exist', () => {
      const listener = vi.fn();
      expect(() => {
        processingStatusService.off('phase-started', listener);
      }).not.toThrow();
    });
  });

  describe('on() return value for unsubscribe', () => {
    it('should return an unsubscribe function from on()', () => {
      const listener = vi.fn();
      const unsubscribe = processingStatusService.on('phase-started', listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('should unsubscribe listener when returned function is called', () => {
      const listener = vi.fn();
      const unsubscribe = processingStatusService.on('phase-started', listener);

      unsubscribe();
      processingStatusService.startPhase('test-session', 'searching');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Listeners for Same Event', () => {
    it('should call all listeners registered for the same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = processingStatusService.on('phase-started', listener1);
      const unsub2 = processingStatusService.on('phase-started', listener2);

      processingStatusService.startPhase('test-session', 'searching');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsub1();
      unsub2();
    });

    it('should pass the same payload to all listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = processingStatusService.on('phase-started', listener1);
      const unsub2 = processingStatusService.on('phase-started', listener2);

      processingStatusService.startPhase('test-session', 'searching');

      expect(listener1.mock.calls[0][0]).toEqual(listener2.mock.calls[0][0]);

      unsub1();
      unsub2();
    });
  });

  describe('reset() method', () => {
    it('should emit processing-reset event with correct sessionId', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('processing-reset', listener);

      processingStatusService.reset('test-session');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session',
          timestamp: expect.any(Number),
        })
      );

      unsub();
    });

    it('should include timestamp in reset event', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('processing-reset', listener);

      processingStatusService.reset('test-session');

      expect(listener).toHaveBeenCalled();
      const timestamp = listener.mock.calls[0][0].timestamp;
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);

      unsub();
    });
  });

  describe('startPhase() method', () => {
    it('should emit phase-started event with sessionId and phase', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('phase-started', listener);

      processingStatusService.startPhase('test-session', 'processing');

      expect(listener).toHaveBeenCalledWith({
        sessionId: 'test-session',
        phase: 'processing',
        startedAt: expect.any(Number),
      });

      unsub();
    });

    it('should handle all phase types', () => {
      const phases: ProcessingPhaseKey[] = ['searching', 'processing', 'generating'];

      phases.forEach((phase) => {
        const listener = vi.fn();
        const unsub = processingStatusService.on('phase-started', listener);

        processingStatusService.startPhase('test-session', phase);

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({ phase })
        );

        unsub();
      });
    });
  });

  describe('completePhase() method', () => {
    it('should emit phase-completed event with sessionId, phase, and elapsedMs', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('phase-completed', listener);

      processingStatusService.completePhase('test-session', 'searching', 500);

      expect(listener).toHaveBeenCalledWith({
        sessionId: 'test-session',
        phase: 'searching',
        elapsedMs: 500,
      });

      unsub();
    });

    it('should include optional metrics when provided', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('phase-completed', listener);

      const metrics: PhaseMetrics = {
        retrievalMetrics: {
          memoriesRetrieved: 10,
          encryptedDataProcessed: true,
        },
      };

      processingStatusService.completePhase('test-session', 'searching', 500, metrics);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ metrics })
      );

      unsub();
    });
  });

  describe('tokensStarted() method', () => {
    it('should emit tokens-started event with sessionId', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('tokens-started', listener);

      processingStatusService.tokensStarted('test-session');

      expect(listener).toHaveBeenCalledWith({
        sessionId: 'test-session',
        timestamp: expect.any(Number),
      });

      unsub();
    });
  });

  describe('completeProcessing() method', () => {
    it('should emit processing-complete event with all required fields', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('processing-complete', listener);

      processingStatusService.completeProcessing('test-session', {
        totalElapsedMs: 1000,
        phaseBreakdown: {
          searching: 300,
          processing: 400,
          generating: 300,
        },
        retrievalMetrics: {
          memoriesRetrieved: 5,
          encryptedDataProcessed: true,
        },
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session',
          totalElapsedMs: 1000,
          phaseBreakdown: expect.any(Object),
          retrievalMetrics: expect.any(Object),
          completedAt: expect.any(Number),
        })
      );

      unsub();
    });
  });

  describe('fail() method', () => {
    it('should emit processing-error event with sessionId and message', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('processing-error', listener);

      processingStatusService.fail('test-session', 'Test error');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session',
          message: 'Test error',
          timestamp: expect.any(Number),
        })
      );

      unsub();
    });

    it('should include optional phase in error event', () => {
      const listener = vi.fn();
      const unsub = processingStatusService.on('processing-error', listener);

      processingStatusService.fail('test-session', 'Test error', 'searching');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'searching',
        })
      );

      unsub();
    });
  });

  describe('Event Isolation', () => {
    it('should not call listeners registered for different events', () => {
      const phaseListener = vi.fn();
      const errorListener = vi.fn();

      const unsub1 = processingStatusService.on('phase-started', phaseListener);
      const unsub2 = processingStatusService.on('processing-error', errorListener);

      processingStatusService.startPhase('test-session', 'searching');

      expect(phaseListener).toHaveBeenCalled();
      expect(errorListener).not.toHaveBeenCalled();

      unsub1();
      unsub2();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle a typical processing workflow', () => {
      const phaseStartedListener = vi.fn();
      const phaseCompletedListener = vi.fn();
      const tokensStartedListener = vi.fn();
      const completeListener = vi.fn();

      const unsub1 = processingStatusService.on('phase-started', phaseStartedListener);
      const unsub2 = processingStatusService.on('phase-completed', phaseCompletedListener);
      const unsub3 = processingStatusService.on('tokens-started', tokensStartedListener);
      const unsub4 = processingStatusService.on('processing-complete', completeListener);

      processingStatusService.startPhase('session-1', 'searching');
      processingStatusService.completePhase('session-1', 'searching', 100);
      processingStatusService.startPhase('session-1', 'processing');
      processingStatusService.completePhase('session-1', 'processing', 200);
      processingStatusService.tokensStarted('session-1');
      processingStatusService.startPhase('session-1', 'generating');
      processingStatusService.completePhase('session-1', 'generating', 150);
      processingStatusService.completeProcessing('session-1', {
        totalElapsedMs: 450,
        phaseBreakdown: {
          searching: 100,
          processing: 200,
          generating: 150,
        },
        retrievalMetrics: {
          memoriesRetrieved: 3,
          encryptedDataProcessed: true,
        },
      });

      expect(phaseStartedListener).toHaveBeenCalledTimes(3);
      expect(phaseCompletedListener).toHaveBeenCalledTimes(3);
      expect(tokensStartedListener).toHaveBeenCalledTimes(1);
      expect(completeListener).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
      unsub3();
      unsub4();
    });
  });
});
