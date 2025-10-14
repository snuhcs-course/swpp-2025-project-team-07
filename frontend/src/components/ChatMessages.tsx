import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { Message } from './ChatInterface';
import { type AuthUser } from '@/services/auth';
import { getUserInitials } from '@/utils/user';
import { MarkdownMessage } from './MarkdownMessage';

interface ChatMessagesProps {
  user: AuthUser | null;
  messages: Message[];
}

export function ChatMessages({ user, messages }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const userInitials = getUserInitials(user?.username, user?.email);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center space-y-6"
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
            {/* Avatar */}
            <div className="flex-shrink-0">
              {message.isUser ? (
                <Avatar className="h-8 w-8">
                  <AvatarImage src="" alt="User" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-8 h-8 bg-gradient-to-br from-primary/30 to-primary/20 rounded-full flex items-center justify-center shadow-sm">
                  <span className="text-xs font-medium text-primary">AI</span>
                </div>
              )}
            </div>

            {/* Message bubble */}
            <div className={`flex-1 max-w-[75%] ${message.isUser ? 'flex justify-end' : ''}`}>
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 + 0.1, ease: "easeOut" }}
                className={`relative px-5 py-4 rounded-3xl shadow-lg backdrop-blur-xl bg-card border border-border ${
                  message.isUser
                    ? 'ml-12'
                    : 'mr-12'
                }`}
              >
                {/* Render markdown for AI messages, plain text for user messages */}
                {message.isUser ? (
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-primary">
                    {message.content}
                  </p>
                ) : (
                  <MarkdownMessage content={message.content} />
                )}

                {/* Message timestamp */}
                <div className={`text-xs mt-3 text-muted-foreground/70`}>
                  {formatTime(message.timestamp)}
                </div>

                {/* Message tail */}
                <div
                  className={`absolute top-5 w-3 h-3 rotate-45 ${
                    message.isUser
                      ? 'bg-gradient-to-br from-primary to-primary/90 -right-1.5'
                      : 'bg-card border-l border-b border-border -left-1.5'
                  }`}
                />
              </motion.div>
            </div>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}