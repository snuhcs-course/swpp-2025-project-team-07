import '@/test/mockMotion';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoPlayerModal } from './VideoPlayerModal';

describe('VideoPlayerModal', () => {
  it('does not render when closed or missing a video URL', () => {
    const { rerender } = render(
      <VideoPlayerModal open={false} videoUrl="video.mp4" onClose={vi.fn()} />,
    );

    expect(screen.queryByText(/Video preview/i)).not.toBeInTheDocument();

    rerender(<VideoPlayerModal open={true} videoUrl={null} onClose={vi.fn()} />);
    expect(screen.queryByText(/Video preview/i)).not.toBeInTheDocument();
  });

  it('renders modal content and closes via overlay', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { container } = render(
      <VideoPlayerModal open={true} videoUrl="video.mp4" onClose={onClose} />,
    );

    expect(screen.getByText('Video preview')).toBeInTheDocument();

    const inner = container.querySelector('.relative');
    if (inner) {
      await user.click(inner);
    }
    expect(onClose).not.toHaveBeenCalled();

    const overlay = container.querySelector('.fixed');
    expect(overlay).not.toBeNull();
    if (overlay) {
      await user.click(overlay);
    }
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('responds to Escape key only when open', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <VideoPlayerModal open={true} videoUrl="video.mp4" onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(
      <VideoPlayerModal open={false} videoUrl="video.mp4" onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('orders sequence clips and toggles navigation buttons', async () => {
    const user = userEvent.setup();
    const sequence = [
      { id: 'b', url: 'second.mp4', order: 2 },
      { id: 'a', url: 'first.mp4', order: 1 },
      { id: 'c', url: 'third.mp4', order: 3 },
    ];

    const { container } = render(
      <VideoPlayerModal
        open={true}
        videoUrl="fallback.mp4"
        sequence={sequence}
        title="Sequence preview"
        onClose={vi.fn()}
      />,
    );

    const getVideoSrc = () => container.querySelector('video')?.getAttribute('src');

    expect(screen.getByText('Clip 1 of 3')).toBeInTheDocument();
    expect(getVideoSrc()).toBe('first.mp4');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(getVideoSrc()).toBe('second.mp4');
    expect(screen.getByText('Clip 2 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(getVideoSrc()).toBe('third.mp4');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(getVideoSrc()).toBe('second.mp4');
  });

  it('advances on video end and resets when the source changes', () => {
    const sequence = [
      { id: '1' },
      { id: '2', url: 'clip-2.mp4' },
    ];

    const { container, rerender } = render(
      <VideoPlayerModal
        open={true}
        videoUrl="fallback.mp4"
        sequence={sequence}
        onClose={vi.fn()}
      />,
    );

    const getVideo = () => container.querySelector('video');

    expect(getVideo()?.getAttribute('src')).toBe('fallback.mp4');

    fireEvent.ended(getVideo() as HTMLVideoElement);
    expect(getVideo()?.getAttribute('src')).toBe('clip-2.mp4');

    rerender(
      <VideoPlayerModal
        open={true}
        videoUrl="updated.mp4"
        sequence={sequence}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Clip 1 of 2')).toBeInTheDocument();
    expect(getVideo()?.getAttribute('src')).toBe('updated.mp4');
  });
});
