import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ChatStatusIndicators, StopIndicator } from './ChatStatusIndicators';
import { processingStatusService } from '@/services/processing-status';

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock processing status service
vi.mock('@/services/processing-status', () => {
  const eventHandlers = new Map<string, Set<Function>>();

  return {
    processingStatusService: {
      on: vi.fn((event: string, handler: Function) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, new Set());
        }
        eventHandlers.get(event)!.add(handler);
        return () => eventHandlers.get(event)!.delete(handler);
      }),
      emit: (event: string, payload: any) => {
        const handlers = eventHandlers.get(event);
        if (handlers) {
          handlers.forEach(handler => handler(payload));
        }
      },
    },
  };
});

describe('ChatStatusIndicators', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders nothing when sessionId is null', () => {
    const { container } = render(<ChatStatusIndicators sessionId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no status is active', () => {
    const { container } = render(<ChatStatusIndicators sessionId="session-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows searching phase when phase-started event is emitted', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    expect(screen.getByText('Searching your memories...')).toBeInTheDocument();
    expect(screen.getByText('Encrypted recall in progress')).toBeInTheDocument();
    expect(screen.getByText('🔍')).toBeInTheDocument();
  });

  it('shows processing phase when phase-started event is emitted', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'processing',
      });
    });

    expect(screen.getByText('Processing securely...')).toBeInTheDocument();
    expect(screen.getByText('All data stays encrypted end-to-end')).toBeInTheDocument();
    expect(screen.getByText('🔐')).toBeInTheDocument();
  });

  it('shows generating phase when phase-started event is emitted', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'generating',
      });
    });

    expect(screen.getByText('Thinking about the best response for you...')).toBeInTheDocument();
    expect(screen.getByText('Carefully combining context into a response')).toBeInTheDocument();
    expect(screen.getByText('✨')).toBeInTheDocument();
  });

  it('shows error state when processing-error event is emitted', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('processing-error', {
        sessionId: 'session-1',
        message: 'Network timeout',
        timestamp: Date.now(),
      });
    });

    expect(screen.getByText(/Secure processing interrupted:/)).toBeInTheDocument();
    expect(screen.getByText(/Network timeout/)).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('hides indicator when processing-reset event is emitted', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    expect(screen.getByText('Searching your memories...')).toBeInTheDocument();

    act(() => {
      processingStatusService.emit('processing-reset', {
        sessionId: 'session-1',
      });
      vi.advanceTimersByTime(220);
    });

    expect(screen.queryByText('Searching your memories...')).not.toBeInTheDocument();
  });

  it('hides indicator when tokens-started event is emitted', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'processing',
      });
    });

    expect(screen.getByText('Processing securely...')).toBeInTheDocument();

    act(() => {
      processingStatusService.emit('tokens-started', {
        sessionId: 'session-1',
      });
      vi.advanceTimersByTime(220);
    });

    expect(screen.queryByText('Processing securely...')).not.toBeInTheDocument();
  });

  it('hides indicator when processing-complete event is emitted', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'generating',
      });
    });

    expect(screen.getByText('Thinking about the best response for you...')).toBeInTheDocument();

    act(() => {
      processingStatusService.emit('processing-complete', {
        sessionId: 'session-1',
      });
      vi.advanceTimersByTime(220);
    });

    expect(screen.queryByText('Thinking about the best response for you...')).not.toBeInTheDocument();
  });

  it('only shows indicators for the active session', () => {
    const { rerender } = render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    expect(screen.getByText('Searching your memories...')).toBeInTheDocument();

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-2',
        phase: 'processing',
      });
    });

    expect(screen.getByText('Searching your memories...')).toBeInTheDocument();
    expect(screen.queryByText('Processing securely...')).not.toBeInTheDocument();

    rerender(<ChatStatusIndicators sessionId="session-2" />);

    expect(screen.queryByText('Searching your memories...')).not.toBeInTheDocument();
    expect(screen.getByText('Processing securely...')).toBeInTheDocument();
  });

  it('preserves session state when switching between sessions', () => {
    const { rerender } = render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    expect(screen.getByText('Searching your memories...')).toBeInTheDocument();

    rerender(<ChatStatusIndicators sessionId="session-2" />);
    expect(screen.queryByText('Searching your memories...')).not.toBeInTheDocument();

    rerender(<ChatStatusIndicators sessionId="session-1" />);
    expect(screen.getByText('Searching your memories...')).toBeInTheDocument();
  });

  it('clears timeouts on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    act(() => {
      processingStatusService.emit('processing-reset', {
        sessionId: 'session-1',
      });
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('cancels hide timeout when new phase starts', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    act(() => {
      processingStatusService.emit('processing-reset', {
        sessionId: 'session-1',
      });
    });

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'processing',
      });
    });

    expect(screen.getByText('Processing securely...')).toBeInTheDocument();
  });

  it('resets state when sessionId becomes null', () => {
    const { rerender } = render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    expect(screen.getByText('Searching your memories...')).toBeInTheDocument();

    rerender(<ChatStatusIndicators sessionId={null} />);

    expect(screen.queryByText('Searching your memories...')).not.toBeInTheDocument();
  });

  it('has correct accessibility attributes for normal status', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('phase-started', {
        sessionId: 'session-1',
        phase: 'searching',
      });
    });

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
  });

  it('has correct accessibility attributes for error status', () => {
    render(<ChatStatusIndicators sessionId="session-1" />);

    act(() => {
      processingStatusService.emit('processing-error', {
        sessionId: 'session-1',
        message: 'Error occurred',
        timestamp: Date.now(),
      });
    });

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-live', 'assertive');
  });
});

describe('StopIndicator', () => {
  it('renders stopped state by default', () => {
    render(<StopIndicator />);

    expect(screen.getByText('Response stopped')).toBeInTheDocument();
    expect(screen.getByText('You can send a new one.')).toBeInTheDocument();
  });

  it('renders stopping state when isStopping is true', () => {
    render(<StopIndicator isStopping={true} />);

    expect(screen.getByText('Stopping response...')).toBeInTheDocument();
    expect(screen.getByText('Finishing up with the model—almost done.')).toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(<StopIndicator />);

    const statusElement = screen.getByRole('status');
    expect(statusElement).toHaveAttribute('aria-live', 'assertive');
  });
});
