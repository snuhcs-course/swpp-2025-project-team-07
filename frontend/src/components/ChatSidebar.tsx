import { motion } from 'motion/react';
import { Plus, MessageSquare, Clock, MoreHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { ChatSession } from './ChatInterface';

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function ChatSidebar({ sessions, currentSessionId, onSelectSession, onNewChat }: ChatSidebarProps) {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    if (hours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  return (
    <div className="w-80 h-full bg-card/80 backdrop-blur-xl border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Button
            onClick={onNewChat}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 group shadow-lg hover:shadow-xl"
          >
            <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />
            New Chat
          </Button>
        </motion.div>
      </div>

      {/* Chat History */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <button
                onClick={() => onSelectSession(session.id)}
                className={`w-full p-3 rounded-xl text-left transition-all duration-300 group hover:bg-accent backdrop-blur-sm ${
                  currentSessionId === session.id 
                    ? 'bg-accent text-accent-foreground shadow-lg' 
                    : 'text-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <div className={`mt-1 p-1.5 rounded-lg transition-colors duration-300 ${
                      currentSessionId === session.id 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'bg-secondary text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground'
                    }`}>
                      <MessageSquare className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="truncate text-sm font-medium">{session.title}</h4>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {session.lastMessage}
                      </p>
                      <div className="flex items-center mt-2 text-xs text-muted-foreground/70">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTime(session.timestamp)}
                      </div>
                    </div>
                  </div>
                  <button
                    className={`opacity-0 group-hover:opacity-100 transition-all duration-300 p-1 rounded-lg hover:bg-accent/70 backdrop-blur-sm ${
                      currentSessionId === session.id ? 'opacity-100' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle session options
                    }}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}