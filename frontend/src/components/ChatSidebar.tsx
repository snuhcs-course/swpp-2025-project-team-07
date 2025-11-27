import { motion } from 'motion/react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { ChatSession } from './ChatInterface';
import { SquarePen, PanelLeft, MoreHorizontal, Trash2 } from 'lucide-react';
import logo from '@/assets/logo.png';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { useState } from 'react';

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onToggleSidebar?: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export function ChatSidebar({ sessions, currentSessionId, onSelectSession, onNewChat, onToggleSidebar, onDeleteSession }: ChatSidebarProps) {
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const handleDeleteConfirm = () => {
    if (sessionToDelete) {
      onDeleteSession(sessionToDelete);
      setSessionToDelete(null);
    }
  };

  return (
    <div className="w-80 h-full bg-card/80 backdrop-blur-xl border-r border-border flex flex-col tour-sidebar">
      {/* Header */}
      <div className="p-4 space-y-7">
        {/* Logo and Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img src={logo} alt="Logo" className="w-8 h-8 rounded-full" />
          </div>
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="h-8 w-8 hover:bg-accent cursor-pointer"
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
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 group shadow-lg hover:shadow-xl cursor-pointer tour-new-chat"
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
              className={`relative w-full p-3 rounded-xl transition-all group hover:bg-accent backdrop-blur-sm cursor-pointer ${
                currentSessionId === session.id
                  ? 'bg-accent text-accent-foreground shadow-lg'
                  : 'text-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onSelectSession(session.id)}
                  className="flex items-center space-x-3 flex-1 min-w-0 text-left"
                >
                  <div className="flex-1 min-w-0 w-[200px]">
                    <h4 className="truncate text-sm font-medium overflow-ellipsis">{session.title}</h4>
                  </div>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-all duration-300 p-1 rounded-lg hover:bg-accent/70 data-[state=open]:bg-accent/70 backdrop-blur-sm ${
                        currentSessionId === session.id ? 'opacity-100' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <MoreHorizontal className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem
                      className="text-[#FE8583] focus:text-[#FE8583] cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionToDelete(session.id);
                      }}
                    >
                      <Trash2 className="text-[#FE8583] w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={sessionToDelete !== null} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this chat. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="text-foreground bg-[#e02e2a] hover:bg-[#e02e2a]/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}