import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Menu, 
  Settings, 
  LogOut, 
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ChatSession } from './ChatInterface';
import { SettingsDialog } from './SettingsDialog';

interface ChatHeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentSession?: ChatSession;
  onSignOut?: () => void;
}

export function ChatHeader({ isSidebarOpen, onToggleSidebar, currentSession, onSignOut }: ChatHeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-16 border-b border-border bg-card/70 backdrop-blur-xl flex items-center justify-between px-6 shadow-sm text-primary"
    >
      {/* Left side - Sidebar toggle and current chat info */}
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="hover:bg-accent transition-all duration-300 rounded-xl"
        >
          <motion.div
            animate={{ rotate: isSidebarOpen ? 0 : 180 }}
            transition={{ duration: 0.2 }}
          >
            <Menu className="w-5 h-5" />
          </motion.div>
        </Button>

        {currentSession && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
            className="flex items-center space-x-3"
          >
            <div>
              <h2 className="font-medium">{currentSession.title}</h2>
              <p className="text-xs text-muted-foreground">
                {currentSession.messages.length} messages
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Right side - Chat options and profile */}
      <div className="flex items-center space-x-2">
        {/* Profile dropdown */}
        <DropdownMenu open={isProfileMenuOpen} onOpenChange={setIsProfileMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-10 w-10 rounded-full hover:bg-accent transition-all duration-300 backdrop-blur-lg"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            >
              <Avatar className="h-9 w-9 bg-primary text-primary-foreground items-center justify-center">
                JD
              </Avatar>
              <motion.div
                animate={{ scale: isProfileMenuOpen ? 1.05 : 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-transparent group-hover:border-primary/30"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center space-x-2 p-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" alt="Profile" />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  JD
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">John Doe</p>
                <p className="text-xs text-muted-foreground">john@example.com</p>
              </div>
            </div>
            <DropdownMenuItem 
              className="cursor-pointer"
              onClick={() => {
                setIsSettingsOpen(true);
                setIsProfileMenuOpen(false);
              }}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={onSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </motion.header>
  );
}