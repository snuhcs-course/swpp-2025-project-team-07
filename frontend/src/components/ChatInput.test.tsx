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
    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const textarea = screen.getByPlaceholderText('Type your message...');
    expect(textarea).toBeInTheDocument();
  });

  it('should call onSendMessage when send button is clicked', async () => {
    const mockOnSendMessage = vi.fn();
    const user = userEvent.setup();

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

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

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

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

    render(<ChatInput onSendMessage={mockOnSendMessage} />);

    const sendButton = screen.getByRole('button');

    // Click send without typing
    await user.click(sendButton);

    // Verify callback was not called
    expect(mockOnSendMessage).not.toHaveBeenCalled();
  });

  it('should disable input when disabled prop is true', () => {
    const mockOnSendMessage = vi.fn();

    render(<ChatInput onSendMessage={mockOnSendMessage} disabled={true} />);

    const textarea = screen.getByPlaceholderText('AI is thinking...');
    expect(textarea).toBeDisabled();
  });
});
