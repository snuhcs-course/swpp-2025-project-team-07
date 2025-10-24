import { motion } from 'motion/react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { ChatSession } from './ChatInterface';
import { SquarePen, PanelLeft } from 'lucide-react';
import logo from '@/assets/logo.png';

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onToggleSidebar?: () => void;
}

export function ChatSidebar({ sessions, currentSessionId, onSelectSession, onNewChat, onToggleSidebar }: ChatSidebarProps) {
  return (
    <div className="w-80 h-full bg-card/80 backdrop-blur-xl border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 space-y-7">
        {/* Logo and Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img src={logo} alt="Logo" className="w-8 h-8 bg-white/90 rounded-full" />
          </div>
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="h-8 w-8 hover:bg-accent"
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* New Chat Button */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Button
            onClick={onNewChat}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 group shadow-lg hover:shadow-xl"
          >
            <SquarePen className="w-4 h-4 mr-2" />
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="flex-1 min-w-0 w-[200px]">
                      <h4 className="truncate text-sm font-medium overflow-ellipsis">{session.title}</h4>
                    </div>
                  </div>
                  {/* <button
                    className={`opacity-0 group-hover:opacity-100 transition-all duration-300 p-1 rounded-lg hover:bg-accent/70 backdrop-blur-sm ${
                      currentSessionId === session.id ? 'opacity-100' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle session options
                    }}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </button> */}
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}