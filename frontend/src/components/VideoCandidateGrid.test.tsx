import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VideoCandidate } from '@/types/video';

import { VideoCandidateGrid } from './VideoCandidateGrid';

const buildVideo = (id: number, overrides: Partial<VideoCandidate> = {}): VideoCandidate => ({
  id: `video-${id}`,
  thumbnailUrl: `https://example.com/thumb-${id}.mp4`,
  videoUrl: `https://example.com/video-${id}.mp4`,
  score: id,
  ...overrides,
});

describe('VideoCandidateGrid', () => {
  it('selects videos and opens preview without toggling selection', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const onOpenVideo = vi.fn();
    const videos = [buildVideo(1)];

    const { rerender } = render(
      <VideoCandidateGrid
        videos={videos}
        selectedIds={[]}
        onToggleSelect={onToggleSelect}
        onOpenVideo={onOpenVideo}
      />,
    );

    const card = screen.getByRole('button', { name: /Select this video/i });
    await user.click(card);
    expect(onToggleSelect).toHaveBeenCalledWith('video-1');

    const previewButton = screen.getByLabelText('Open video preview');
    await user.click(previewButton);
    expect(onOpenVideo).toHaveBeenCalledWith('video-1');
    expect(onToggleSelect).toHaveBeenCalledTimes(1);

    rerender(
      <VideoCandidateGrid
        videos={videos}
        selectedIds={['video-1']}
        onToggleSelect={onToggleSelect}
        onOpenVideo={onOpenVideo}
      />,
    );

    expect(screen.getByRole('button', { name: /Video selected/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('handles keyboard activation for preview', () => {
    const onToggleSelect = vi.fn();
    const onOpenVideo = vi.fn();

    render(
      <VideoCandidateGrid
        videos={[buildVideo(2)]}
        selectedIds={[]}
        onToggleSelect={onToggleSelect}
        onOpenVideo={onOpenVideo}
      />,
    );

    const previewButton = screen.getByLabelText('Open video preview');

    fireEvent.keyDown(previewButton, { key: 'Enter' });
    fireEvent.keyDown(previewButton, { key: ' ' });

    expect(onOpenVideo).toHaveBeenCalledTimes(2);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('shows fallback preview when thumbnail is missing', () => {
    render(
      <VideoCandidateGrid
        videos={[buildVideo(3, { thumbnailUrl: '' })]}
        selectedIds={[]}
        onToggleSelect={vi.fn()}
        onOpenVideo={vi.fn()}
      />,
    );

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('paginates results and resets when the list shrinks', async () => {
    const user = userEvent.setup();
    const videos = Array.from({ length: 8 }, (_, index) => buildVideo(index + 1));
    const onToggleSelect = vi.fn();
    const onOpenVideo = vi.fn();

    const { rerender } = render(
      <VideoCandidateGrid
        videos={videos}
        selectedIds={[]}
        onToggleSelect={onToggleSelect}
        onOpenVideo={onOpenVideo}
      />,
    );

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    rerender(
      <VideoCandidateGrid
        videos={videos.slice(0, 7)}
        selectedIds={[]}
        onToggleSelect={onToggleSelect}
        onOpenVideo={onOpenVideo}
      />,
    );

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('limits pagination to three pages even with many videos', async () => {
    const user = userEvent.setup();
    const videos = Array.from({ length: 20 }, (_, index) => buildVideo(index + 1));

    render(
      <VideoCandidateGrid
        videos={videos}
        selectedIds={[]}
        onToggleSelect={vi.fn()}
        onOpenVideo={vi.fn()}
      />,
    );

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /Select this video/i })).toHaveLength(6);
  });
});
