import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, Square, Video, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import type { ChatRunState } from './ChatInterface';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStop?: () => void;
  runState: ChatRunState;
  modelNotReady?: boolean;
  isStopping?: boolean;
  videoRagEnabled?: boolean;
  onToggleVideoRag?: () => void;
  queryTransformEnabled?: boolean;
  onToggleQueryTransform?: () => void;
}

export function ChatInput({
  onSendMessage,
  onStop,
  runState,
  modelNotReady = false,
  isStopping = false,
  videoRagEnabled = false,
  onToggleVideoRag,
  queryTransformEnabled = true,
  onToggleQueryTransform,
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
    <motion.div
      className="px-6 pb-6"
      layout
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          layout
          transition={{ duration: 0.3 }}
          className="relative bg-background border border-border rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl"
        >
          {/* Input area */}
          <div className="flex flex-col p-5 gap-3">

            {/* Text input row */}
            <div className="flex flex-col justify-end">
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "AI is thinking..." : videoRagEnabled ? "Describe the video..." : "Type your message..."}
                className="break-words min-h-0 max-h-35 border-0 dark:bg-background bg-background focus:ring-0 focus:outline-none pl-2 pr-7 py-0 placeholder:text-muted-foreground/60 text-primary focus-visible:ring-0 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                rows={1}
              />
            </div>

            {/* Buttons row - Video RAG and Send button */}
            <div className="flex items-center justify-between">
              {/* Video RAG toggle button */}
              {onToggleVideoRag ? (
                <Button
                  onClick={onToggleVideoRag}
                  disabled={isStreaming}
                  variant="ghost"
                  className={`transition-all duration-200 gap-1.5 px-3 py-2.5 h-auto rounded-full ${
                    videoRagEnabled
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50'
                  } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={videoRagEnabled ? 'Disable video search for faster responses' : 'Enable video search for more context'}
                >
                  <motion.div
                    className="flex items-center gap-1.5"
                    whileHover={{ scale: isStreaming ? 1 : 1.02 }}
                    whileTap={{ scale: isStreaming ? 1 : 0.98 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Video search</span>
                  </motion.div>
                </Button>
              ) : (
                <div />
              )}

              {/* Send button */}
              <Button
                onClick={showStopButton ? onStop : handleSend}
                disabled={showStopButton ? !onStop : isSendDisabled}
                className={`shrink-0 transition-all duration-300 backdrop-blur-sm rounded-xl ${
                  canInteract
                    ? 'bg-linear-to-br from-primary/90 to-primary hover:from-primary hover:to-primary/90 text-primary-foreground shadow-lg hover:shadow-xl cursor-pointer'
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
    </motion.div>
  );
}
