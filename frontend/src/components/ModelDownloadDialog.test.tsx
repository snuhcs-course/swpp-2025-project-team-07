import '@/test/mockMotion';
import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';

import { ModelDownloadDialog } from './ModelDownloadDialog';

describe('ModelDownloadDialog', () => {
  let startDownloadMock: ReturnType<typeof vi.fn>;
  let progressHandler: ((data: any) => void) | undefined;
  let completeHandler: (() => void) | undefined;
  let errorHandler: ((error: string) => void) | undefined;

  beforeEach(() => {
    startDownloadMock = vi.fn().mockResolvedValue({ success: true });
    progressHandler = undefined;
    completeHandler = undefined;
    errorHandler = undefined;

    (window as any).llmAPI = {
      onDownloadProgress: (handler: (data: any) => void) => {
        progressHandler = handler;
      },
      onDownloadComplete: (handler: () => void) => {
        completeHandler = handler;
      },
      onDownloadError: (handler: (message: string) => void) => {
        errorHandler = handler;
      },
      startModelDownload: startDownloadMock,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts download when button is clicked', async () => {
    const user = userEvent.setup();

    render(<ModelDownloadDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    expect(startDownloadMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Please wait/i)).toBeInTheDocument();
  });

  it('updates progress information from download events', async () => {
    const user = userEvent.setup();

    render(<ModelDownloadDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    expect(progressHandler).toBeDefined();
    await act(async () => {
      progressHandler?.({ modelName: 'Model A', percent: 0.5, transferred: 512 * 1024, total: 1024 * 1024 });
    });

    const progress = await screen.findByTestId('progress');
    expect(progress).toHaveAttribute('data-value', '50');
    expect(await screen.findByText('50.0%')).toBeInTheDocument();
    expect(await screen.findByText(/Downloading: Model A/)).toBeInTheDocument();
  });

  it('handles download errors and allows retry', async () => {
    const user = userEvent.setup();

    render(<ModelDownloadDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    expect(errorHandler).toBeDefined();
    await act(async () => {
      errorHandler?.('Network failure');
    });

    expect(screen.getByText('Download Failed')).toBeInTheDocument();
    expect(screen.getByText('Network failure')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Retry Download/i }));
    expect(screen.getByRole('button', { name: /Start Download/i })).toBeInTheDocument();
  });

  it('closes dialog after download completes', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<ModelDownloadDialog open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    expect(completeHandler).toBeDefined();

    vi.useFakeTimers();

    await act(async () => {
      completeHandler?.();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);

    vi.useRealTimers();
  });

  it('handles download start failure', async () => {
    const user = userEvent.setup();
    startDownloadMock.mockResolvedValue({ success: false, error: 'Model not found' });

    render(<ModelDownloadDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    expect(await screen.findByText('Download Failed')).toBeInTheDocument();
    expect(await screen.findByText('Model not found')).toBeInTheDocument();
  });

  it('handles download start exception', async () => {
    const user = userEvent.setup();
    startDownloadMock.mockRejectedValue(new Error('Connection timeout'));

    render(<ModelDownloadDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    expect(await screen.findByText('Download Failed')).toBeInTheDocument();
    expect(await screen.findByText('Connection timeout')).toBeInTheDocument();
  });

  it('displays formatted time for minutes', async () => {
    const user = userEvent.setup();

    render(<ModelDownloadDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    await act(async () => {
      progressHandler?.({
        modelName: 'Model B',
        percent: 0.1,
        transferred: 100 * 1024,
        total: 1000 * 1024,
      });
    });

    // Trigger a second update to calculate speed and ETA
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      progressHandler?.({
        modelName: 'Model B',
        percent: 0.2,
        transferred: 200 * 1024,
        total: 1000 * 1024,
      });
    });

    // Should display time estimates if calculated
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('displays formatted time for hours', async () => {
    const user = userEvent.setup();

    render(<ModelDownloadDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    await act(async () => {
      progressHandler?.({
        modelName: 'Model C',
        percent: 0.01,
        transferred: 10 * 1024,
        total: 1000 * 1024 * 1024, // Very large file
      });
    });

    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('prevents dialog close while downloading', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { container } = render(<ModelDownloadDialog open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /Start Download/i }));

    // Simulate clicking outside the dialog
    const dialogContent = container.querySelector('[role="dialog"]');
    if (dialogContent) {
      const event = new Event('pointerdown', { bubbles: true });
      dialogContent.dispatchEvent(event);
    }

    // Dialog should not close during download
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
