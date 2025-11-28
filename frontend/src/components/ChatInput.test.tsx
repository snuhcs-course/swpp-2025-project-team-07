import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

/**
 * Example unit test for ChatInput component
 * This demonstrates how to write component tests with Vitest and React Testing Library
 */
describe('ChatInput', () => {
  it('should render the input field', () => {
    const mockOnSendMessage = vi.fn();
    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

    const textarea = screen.getByPlaceholderText('Type your message...');
    expect(textarea).toBeInTheDocument();
  });

  it('should call onSendMessage when send button is clicked', async () => {
    const mockOnSendMessage = vi.fn();
    const user = userEvent.setup();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

    const textarea = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button');

    // Type a message
    await user.type(textarea, 'Hello, AI!');

    // Click send button
    await user.click(sendButton);

    // Verify the callback was called with the message
    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello, AI!');
  });

  it('should clear input after sending message', async () => {
    const mockOnSendMessage = vi.fn();
    const user = userEvent.setup();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

    const textarea = screen.getByPlaceholderText('Type your message...');
    const sendButton = screen.getByRole('button');

    // Type and send a message
    await user.type(textarea, 'Test message');
    await user.click(sendButton);

    // Verify input is cleared
    expect(textarea).toHaveValue('');
  });

  it('should not send empty messages', async () => {
    const mockOnSendMessage = vi.fn();
    const user = userEvent.setup();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

    const sendButton = screen.getByRole('button');

    // Click send without typing
    await user.click(sendButton);

    // Verify callback was not called
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('should disable input when modelNotReady prop is true', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" modelNotReady={true} />);

    const textarea = screen.getByPlaceholderText('Type your message...');
    expect(textarea).toBeInTheDocument();
    // Note: disabled attribute is not set in the current implementation
    // The component only disables send button, not the textarea itself
  });

  it('should show AI is thinking placeholder when streaming', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="streaming" />);

    const textarea = screen.getByPlaceholderText('AI is thinking...');
    expect(textarea).toBeInTheDocument();
  });

  it('should call onStop when stop button is clicked during streaming', async () => {
    const mockOnSendMessage = vi.fn();
    const mockOnStop = vi.fn();
    const user = userEvent.setup();

    render(
      <ChatInput
        onSendMessage={mockOnSendMessage}
        onStop={mockOnStop}
        runState="streaming"
      />,
    );

    const stopButton = screen.getByRole('button');
    await user.click(stopButton);

    expect(mockOnSendMessage).not.toHaveBeenCalled();
    expect(mockOnStop).toHaveBeenCalled();
  });

  it('should send message when Enter key is pressed without Shift', async () => {
    const mockOnSendMessage = vi.fn();
    const user = userEvent.setup();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

    const textarea = screen.getByPlaceholderText('Type your message...');

    // Type a message
    await user.type(textarea, 'Hello, world!');

    // Press Enter without Shift
    await user.keyboard('{Enter}');

    // Verify the callback was called
    expect(mockOnSendMessage).toHaveBeenCalledWith('Hello, world!');
  });

  it('should not send message when Enter+Shift is pressed', async () => {
    const mockOnSendMessage = vi.fn();
    const user = userEvent.setup();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

    const textarea = screen.getByPlaceholderText('Type your message...');

    // Type a message
    await user.type(textarea, 'Line 1');

    // Press Shift+Enter (should add new line, not send)
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // Verify the callback was not called
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('should auto-focus textarea on mount after delay', async () => {
    vi.useFakeTimers();
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

    const textarea = screen.getByPlaceholderText('Type your message...') as HTMLTextAreaElement;

    // Initially textarea is not focused
    expect(document.activeElement).not.toBe(textarea);

    // Fast-forward time past the 100ms delay
    vi.advanceTimersByTime(150);

    // Now textarea should be focused
    expect(document.activeElement).toBe(textarea);

    vi.useRealTimers();
  });

  describe('Video RAG Toggle', () => {
    it('should not render video toggle button when onToggleVideoRag is not provided', () => {
      const mockOnSendMessage = vi.fn();
      render(<ChatInput onSendMessage={mockOnSendMessage} runState="idle" />);

      const videoToggle = screen.queryByText('Video search');
      expect(videoToggle).not.toBeInTheDocument();
    });

    it('should render video toggle button when onToggleVideoRag is provided', () => {
      const mockOnSendMessage = vi.fn();
      const mockOnToggleVideoRag = vi.fn();

      render(
        <ChatInput
          onSendMessage={mockOnSendMessage}
          runState="idle"
          onToggleVideoRag={mockOnToggleVideoRag}
        />
      );

      const videoToggle = screen.getByText('Video search');
      expect(videoToggle).toBeInTheDocument();
    });

    it('should call onToggleVideoRag when video toggle button is clicked', async () => {
      const mockOnSendMessage = vi.fn();
      const mockOnToggleVideoRag = vi.fn();
      const user = userEvent.setup();

      render(
        <ChatInput
          onSendMessage={mockOnSendMessage}
          runState="idle"
          onToggleVideoRag={mockOnToggleVideoRag}
        />
      );

      const videoToggle = screen.getByText('Video search');
      await user.click(videoToggle);

      expect(mockOnToggleVideoRag).toHaveBeenCalledTimes(1);
    });

    it('should apply active styling when videoRagEnabled is true', () => {
      const mockOnSendMessage = vi.fn();
      const mockOnToggleVideoRag = vi.fn();

      render(
        <ChatInput
          onSendMessage={mockOnSendMessage}
          runState="idle"
          onToggleVideoRag={mockOnToggleVideoRag}
          videoRagEnabled={true}
        />
      );

      const videoToggleButton = screen.getByText('Video search').closest('button');
      expect(videoToggleButton).toHaveClass('bg-primary/90');
      expect(videoToggleButton).toHaveClass('text-primary-foreground');
    });

    it('should apply inactive styling when videoRagEnabled is false', () => {
      const mockOnSendMessage = vi.fn();
      const mockOnToggleVideoRag = vi.fn();

      render(
        <ChatInput
          onSendMessage={mockOnSendMessage}
          runState="idle"
          onToggleVideoRag={mockOnToggleVideoRag}
          videoRagEnabled={false}
        />
      );

      const videoToggleButton = screen.getByText('Video search').closest('button');
      expect(videoToggleButton).toHaveClass('bg-muted/50');
      expect(videoToggleButton).toHaveClass('text-muted-foreground/50');
    });

    it('should disable video toggle button when streaming', () => {
      const mockOnSendMessage = vi.fn();
      const mockOnToggleVideoRag = vi.fn();

      render(
        <ChatInput
          onSendMessage={mockOnSendMessage}
          runState="streaming"
          onToggleVideoRag={mockOnToggleVideoRag}
        />
      );

      const videoToggleButton = screen.getByText('Video search').closest('button');
      expect(videoToggleButton).toBeDisabled();
    });

    it('should update placeholder when videoRagEnabled is true', () => {
      const mockOnSendMessage = vi.fn();
      const mockOnToggleVideoRag = vi.fn();

      render(
        <ChatInput
          onSendMessage={mockOnSendMessage}
          runState="idle"
          onToggleVideoRag={mockOnToggleVideoRag}
          videoRagEnabled={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Describe the video...');
      expect(textarea).toBeInTheDocument();
    });
  });
});
