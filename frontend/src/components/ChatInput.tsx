import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, Square } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import type { ChatRunState } from './ChatInterface';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStop?: () => void;
  runState: ChatRunState;
  modelNotReady?: boolean;
  isStopping?: boolean;
}

export function ChatInput({
  onSendMessage,
  onStop,
  runState,
  modelNotReady = false,
  isStopping = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = runState === 'awaitingFirstToken' || runState === 'streaming';
  const textareaNotReady = modelNotReady || isStreaming;
  const showStopButton = isStreaming;

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        // Re-focus after sending
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !showStopButton) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && !textareaNotReady) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message, textareaNotReady]);

  // Auto-focus on mount (with small delay for animation)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current && !textareaNotReady) {
        textareaRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [textareaNotReady]);

  const isSendDisabled = !message.trim() || textareaNotReady || isStopping;
  const canStop = showStopButton && !!onStop;
  const canSend = !showStopButton && !isSendDisabled;
  const canInteract = canStop || canSend;

  return (
    <div className="border-t border-border bg-card/70 backdrop-blur-xl p-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative bg-background border border-border rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl"
        >
          {/* Input area */}
          <div className="flex items-end space-x-3 py-3 px-4">

            {/* Text input */}
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "AI is thinking..." : "Type your message..."}
                className="break-all min-h-[48px] max-h-32 border-0 dark:bg-background bg-background focus:ring-0 focus:outline-none p-1 placeholder:text-muted-foreground/60 text-primary focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                rows={1}
              />
            </div>

            {/* Send button */}
            <Button
              onClick={showStopButton ? onStop : handleSend}
              disabled={showStopButton ? !onStop : isSendDisabled}
              className={`flex-shrink-0 transition-all duration-300 backdrop-blur-sm rounded-xl ${
                canInteract
                  ? 'bg-gradient-to-br from-primary/90 to-primary hover:from-primary hover:to-primary/90 text-primary-foreground shadow-lg hover:shadow-xl cursor-pointer'
                  : 'bg-muted/50 text-muted-foreground cursor-not-allowed'
              }`}
              size="icon"
            >
              <motion.div
                whileHover={{ scale: canInteract ? 1.05 : 1 }}
                whileTap={{ scale: canInteract ? 0.95 : 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {showStopButton ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </motion.div>
            </Button>
          </div>

        </motion.div>

        {/* Helpful tips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="text-center text-xs text-muted-foreground mt-2"
        >
          {showStopButton ? 'Stop the AI response' : 'Press Enter to send, Shift + Enter for new line'}
        </motion.div>
      </div>
    </div>
  );
}
