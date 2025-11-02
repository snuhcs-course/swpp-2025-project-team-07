import '@/test/mockMotion';
import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';

vi.mock('./MarkdownMessage', () => ({
  MarkdownMessage: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));


import { ChatMessages } from './ChatMessages';

describe('ChatMessages', () => {
  beforeEach(() => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation((): any => ({ lineHeight: '20', getPropertyValue: () => '20' }));
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders empty state when there are no messages', () => {
    render(<ChatMessages user={null} messages={[]} />);

    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
  });

  it('renders user and AI messages', () => {
    const messages = [
      { id: '1', content: 'Hello AI', isUser: true, timestamp: new Date() },
      { id: '2', content: 'Hello human', isUser: false, timestamp: new Date() },
    ];

    render(<ChatMessages user={{ id: 1, email: 'user@example.com', username: 'User', date_joined: '' }} messages={messages} />);

    expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument();
    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('Hello human');
  });

  it('applies multiline styling for long user messages', async () => {
    const multiline = 'Line 1\nLine 2\nLine 3';
    render(
      <ChatMessages
        user={{ id: 1, email: 'user@example.com', username: 'User', date_joined: '' }}
        messages={[{ id: 'm1', content: multiline, isUser: true, timestamp: new Date() }]}
      />
    );

    const bubble = screen.getByText(/Line 1/).closest('div');
    const paragraph = bubble?.querySelector('p');
    expect(paragraph).toBeTruthy();

    if (paragraph) {
      Object.defineProperty(paragraph, 'scrollHeight', { value: 60, configurable: true });
    }

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(bubble?.className).toContain('py-3');
  });
});
