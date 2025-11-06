import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ScrollArea } from './ui/scroll-area';
import { Message } from './ChatInterface';
import { type AuthUser } from '@/services/auth';
import { getUserInitials } from '@/utils/user';
import { MarkdownMessage } from './MarkdownMessage';

interface ChatMessagesProps {
  user: AuthUser | null;
  messages: Message[];
  isLoading?: boolean;
  statusIndicator?: ReactNode;
}

function UserMessageBubble({ content, className }: { content: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);

  useEffect(() => {
    const checkMultiline = () => {
      if (containerRef.current) {
        const textElement = containerRef.current.querySelector('p');
        if (textElement) {
          // Check if the content height is greater than a single line height
          const lineHeight = parseFloat(window.getComputedStyle(textElement).lineHeight);
          const contentHeight = textElement.scrollHeight;
          setIsMultiline(contentHeight > lineHeight * 1.5);
        }
      }
    };

    // Re-check on window resize
    window.addEventListener('resize', checkMultiline);
    return () => {
      window.removeEventListener('resize', checkMultiline);
    };
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={`relative px-4 rounded-[18px] rounded-se-lg bg-muted/70 border border-border ${
        isMultiline ? 'py-3' : 'py-1.5'
      } ${className || ''}`}
    >
      <p className="whitespace-pre-wrap break-words leading-relaxed text-primary">
        {content}
      </p>
    </div>
  );
}

export function ChatMessages({ user, messages, isLoading = false, statusIndicator }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const userInitials = getUserInitials(user?.username, user?.email);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) {
    return <div className="flex-1" />;
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center space-y-6 max-w-md"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-primary/30 to-primary/20 rounded-3xl flex items-center justify-center mx-auto shadow-xl">
            <span className="text-3xl font-medium text-primary">AI</span>
          </div>
          <div>
            <h3 className="text-xl font-medium">Start a conversation</h3>
            <p className="text-muted-foreground">
              Ask me anything and I'll be happy to help!
            </p>
          </div>
        </motion.div>

        {statusIndicator && (
          <div className="w-full max-w-xl self-start sm:self-center">
            {statusIndicator}
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 h-full p-4">
      <div className="space-y-6 max-w-4xl mx-auto pb-4">
        {messages.map((message, index) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
            className={`flex items-start space-x-4 ${
              message.isUser ? 'flex-row-reverse space-x-reverse' : ''
            }`}
          >
            {/* Message content */}
            <div className={`flex-1 ${message.isUser ? 'max-w-[70%] flex justify-end' : 'max-w-full'}`}>
              {message.isUser ? (
                <motion.div
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 + 0.1, ease: "easeOut" }}
                >
                  <UserMessageBubble content={message.content} />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 + 0.1, ease: "easeOut" }}
                  className="py-2"
                >
                  <MarkdownMessage content={message.content} />
                </motion.div>
              )}
            </div>
          </motion.div>
        ))}
        {statusIndicator && (
          <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-start space-x-4"
          >
            <div className="flex-1 max-w-full">
              {statusIndicator}
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
