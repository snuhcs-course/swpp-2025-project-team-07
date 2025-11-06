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
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);

    vi.useRealTimers();
  });
});
