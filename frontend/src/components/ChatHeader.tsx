import { useState } from "react";
import { motion } from "motion/react";
import { PanelLeft, Settings, LogOut, Circle } from "lucide-react";

import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ChatSession } from "./ChatInterface";
import { SettingsDialog } from "./SettingsDialog";
import { type AuthUser } from "@/services/auth";
import { getUserInitials } from "@/utils/user";
import { useRecorder, useChunkedEmbeddingQueue } from '@/recording/provider';
import { memoryService } from '@/services/memory';


interface ChatHeaderProps {
  user: AuthUser | null;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentSession?: ChatSession;
  onSignOut?: () => void;
}

declare global {
  interface Window {
    recorder: {
      listSources: () => Promise<Array<{ id: string; name: string }>>;
      chooseSource: (id: string) => Promise<void>;
      start: () => Promise<void>;
      stop: () => Promise<void>;
    };
  }
}

export function ChatHeader({
  user,
  isSidebarOpen,
  onToggleSidebar,
  currentSession,
  onSignOut,
}: ChatHeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const recorder = useRecorder();

  const {
    startChunked,
    stopChunked,
    isRecording,
    isProcessing,
  } = useChunkedEmbeddingQueue({
    onEmbeddedChunk: async ({ chunk, pooled, suffix }) => {
      try {
        await memoryService.storeVideoEmbedding(
          pooled,
          chunk.blob,
          {
            duration: chunk.durationMs,
            width: chunk.width,
            height: chunk.height,
          },
          suffix
        );
      } catch (error) {
        console.error('[video upload] failed:', error);
      }
    },
  });

  async function handleStartRecording() {
    try {
      const getSources = (recorder as any).getSources?.bind(recorder);
      const chooseSource = (recorder as any).chooseSource?.bind(recorder);
      if (getSources && chooseSource) {
        const sources = await getSources();
        const screen = sources.find((s: any) => /screen/i.test(s.name)) ?? sources[0];
        if (screen) await chooseSource(screen.id);
      }
      await startChunked();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleStopRecording() {
    try {
      await stopChunked();
    } catch (e) {
      console.error('[recording] stopChunked failed:', e);
    }
  }

  const userInitials = getUserInitials(user?.username, user?.email);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-16 bg-card/70 backdrop-blur-xl flex items-center justify-between px-6 shadow-sm text-primary"
    >
      {/* Left side - Sidebar toggle and current chat info */}
      <div className="flex items-center space-x-4">
        <motion.div
          animate={{
            opacity: isSidebarOpen ? 0 : 1,
            x: isSidebarOpen ? -20 : 0,
            width: isSidebarOpen ? 0 : 'auto',
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={{ overflow: 'hidden' }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className="hover:bg-accent transition-all duration-300 rounded-xl cursor-pointer"
            disabled={isSidebarOpen}
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
        </motion.div>

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

      {/* Right side - Chat options, controls and profile */}
      <div className="flex items-center space-x-2">
        {isRecording ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleStopRecording}
            className="rounded-xl cursor-pointer"
            title="Stop (enqueue last) & embed"
          >
            <Circle className="w-4 h-4 mr-1" />
            Stop
          </Button>
        ) : isProcessing ? (
          <Button
            size="sm"
            className="rounded-xl"
            title="Embedding chunks..."
            disabled
          >
            Embedding...
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleStartRecording}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            disabled={isProcessing}
            title="Start screen recording"
          >
            <Circle className="w-4 h-4 mr-1" />
            Start
          </Button>
        )}
        {/* Show queue state simply */}
        {/* {(isRecording || isProcessing) && (
          <div className="text-xs text-muted-foreground ml-2">
            Queue: {pending} pending • {processed} done
          </div>
        )} */}
        {/* Profile dropdown */}
        <DropdownMenu
          open={isProfileMenuOpen}
          onOpenChange={setIsProfileMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-10 w-10 rounded-full hover:bg-accent transition-all duration-300 backdrop-blur-lg cursor-pointer"
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            >
              <Avatar className="h-9 w-9 bg-primary text-primary-foreground items-center justify-center">
                {userInitials}
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
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">
                  {user?.username || "User"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {user?.email || ""}
                </p>
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
      <SettingsDialog
        user={user}
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </motion.header>
  );
}
