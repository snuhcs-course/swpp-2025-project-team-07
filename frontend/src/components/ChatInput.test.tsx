import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('placeholder', 'Describe the video...');
  });

  it('should call onSendMessage when send button is clicked', async () => {
    const mockOnSendMessage = vi.fn();
    const user = userEvent.setup();

    render(
      <ChatInput onSendMessage={mockOnSendMessage} runState="idle" videoRagEnabled={false} />
    );

    const textarea = screen.getByRole('textbox');
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

    render(
      <ChatInput onSendMessage={mockOnSendMessage} runState="idle" videoRagEnabled={false} />
    );

    const textarea = screen.getByRole('textbox');
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

    render(
      <ChatInput onSendMessage={mockOnSendMessage} runState="idle" videoRagEnabled={false} />
    );

    const sendButton = screen.getByRole('button');

    // Click send without typing
    await user.click(sendButton);

    // Verify callback was not called
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('should disable sending when modelNotReady prop is true', () => {
    const mockOnSendMessage = vi.fn();

    render(
      <ChatInput
        onSendMessage={mockOnSendMessage}
        runState="idle"
        modelNotReady={true}
        videoRagEnabled={false}
      />
    );

    const sendButton = screen.getByRole('button');
    expect(sendButton).toBeDisabled();
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

    render(
      <ChatInput onSendMessage={mockOnSendMessage} runState="idle" videoRagEnabled={false} />
    );

    const textarea = screen.getByRole('textbox');

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

    render(
      <ChatInput onSendMessage={mockOnSendMessage} runState="idle" videoRagEnabled={false} />
    );

    const textarea = screen.getByRole('textbox');

    // Type a message
    await user.type(textarea, 'Line 1');

    // Press Shift+Enter (should add new line, not send)
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // Verify the callback was not called
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('should auto-focus textarea on mount after delay', async () => {
    const mockOnSendMessage = vi.fn();

    render(
      <ChatInput onSendMessage={mockOnSendMessage} runState="idle" videoRagEnabled={false} />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Initially textarea is not focused
    expect(document.activeElement).not.toBe(textarea);

    // Wait for the delayed focus effect to run
    await waitFor(() => expect(textarea).toHaveFocus(), { timeout: 500 });
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
      expect(videoToggleButton).toHaveClass('bg-linear-to-br');
      expect(videoToggleButton).toHaveClass('from-primary/90');
      expect(videoToggleButton).toHaveClass('to-primary');
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
      expect(videoToggleButton).toHaveClass('text-muted-foreground/70');
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
