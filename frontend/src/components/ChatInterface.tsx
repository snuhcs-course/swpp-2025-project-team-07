import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChatSidebar } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ModelDownloadDialog } from './ModelDownloadDialog';
import { type AuthUser } from '@/services/auth';
import { llmService } from '@/services/llm';
import { chatService } from '@/services/chat';
import { memoryService } from '@/services/memory';
import type { ChatSession as BackendChatSession, ChatMessage as BackendChatMessage } from '@/types/chat';

// Local UI types
export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: Message[];
}

interface ChatInterfaceProps {
  user: AuthUser | null;
  onSignOut?: () => void;
}

/**
 * Convert backend ChatMessage to local Message type.
 */
function toLocalMessage(msg: BackendChatMessage): Message {
  return {
    id: msg.id.toString(),
    content: msg.content,
    isUser: msg.role === 'user',
    timestamp: new Date(msg.timestamp),
  };
}

/**
 * Convert backend ChatSession to local ChatSession type.
 */
function toLocalSession(session: BackendChatSession): ChatSession {
  const messages = session.messages?.map(toLocalMessage) || [];
  const lastMessage = messages.length > 0
    ? messages[messages.length - 1].content.substring(0, 100)
    : '';

  return {
    id: session.id.toString(),
    title: session.title,
    lastMessage,
    timestamp: session.last_message_timestamp
      ? new Date(session.last_message_timestamp)
      : new Date(session.created_at),
    messages,
  };
}

export function ChatInterface({ user, onSignOut }: ChatInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const currentSession = currentSessionId
    ? sessions.find(s => s.id === currentSessionId)
    : undefined;

  // Load sessions from backend on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setIsLoadingSessions(true);
        const backendSessions = await chatService.fetchSessions();
        const localSessions = backendSessions.map(toLocalSession);
        setSessions(localSessions);

        // Select first session if available
        if (localSessions.length > 0 && !currentSessionId) {
          setCurrentSessionId(localSessions[0].id);
        }
      } catch (error) {
        console.error('Failed to load sessions:', error);
        // Don't auto-create session on error - let user create manually
        setSessions([]);
      } finally {
        setIsLoadingSessions(false);
      }
    };

    loadSessions();
  }, []);

  // Load messages for current session when clicked
  useEffect(() => {
    const loadSessionData = async () => {
      if (!currentSessionId) {
        setIsLoadingMessages(false);
        return;
      }

      const session = sessions.find(s => s.id === currentSessionId);
      if (!session || session.messages.length > 0) {
        setIsLoadingMessages(false);
        return; // Already loaded
      }

      try {
        setIsLoadingMessages(true);
        // Use fetchSession to get session with all messages in one call
        const backendSession = await chatService.fetchSession(parseInt(currentSessionId));
        const localSession = toLocalSession(backendSession);

        setSessions(prevSessions =>
          prevSessions.map(s =>
            s.id === currentSessionId
              ? { ...s, messages: localSession.messages, title: localSession.title }
              : s
          )
        );
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    loadSessionData();
  }, [currentSessionId]);

  // Check model status on mount
  useEffect(() => {
    const checkModelStatus = async () => {
      try {
        const status = await window.llmAPI.checkModelDownloaded();

        if (!status.downloaded) {
          setShowDownloadDialog(true);
          setIsModelReady(false);
        } else if (status.initialized) {
          setIsModelReady(true);
          setShowDownloadDialog(false);
        } else {
          setIsModelReady(false);
        }
      } catch (error) {
        console.error('Failed to check model status:', error);
      }
    };

    checkModelStatus();

    // Listen for model status events
    const handleModelNotFound = () => {
      setShowDownloadDialog(true);
      setIsModelReady(false);
    };

    const handleLLMReady = () => {
      setIsModelReady(true);
      setShowDownloadDialog(false);
    };

    const handleLLMError = (error: { message: string; error: string }) => {
      console.error('LLM Error:', error);
      setIsModelReady(false);
    };

    window.llmAPI.onModelNotFound(handleModelNotFound);
    window.llmAPI.onLLMReady(handleLLMReady);
    window.llmAPI.onLLMError(handleLLMError);

    // Cleanup would go here if we had removeListener functions
  }, []);

  const handleSendMessage = async (content: string) => {
    if (isLoading || !isModelReady) return;

    // Auto-create session if none exists
    let session = currentSession;
    if (!session) {
      try {
        // Create new session synchronously
        const backendSession = await chatService.createSession('New Conversation');
        const localSession = toLocalSession(backendSession);
        setSessions(prev => [localSession, ...prev]);
        setCurrentSessionId(localSession.id);
        session = localSession;
      } catch (error) {
        console.error('Failed to create session:', error);
        return;
      }
    }

    const sessionIdNum = parseInt(session.id);
    setIsLoading(true);

    try {
      // Send user message to backend (encrypted automatically)
      const userMsg = await chatService.sendMessage(sessionIdNum, 'user', content);
      const localUserMsg = toLocalMessage(userMsg);

      // Add user message to UI
      setSessions(prevSessions =>
        prevSessions.map(s =>
          s.id === session!.id
            ? {
                ...s,
                messages: [...s.messages, localUserMsg],
                lastMessage: content.substring(0, 100),
                timestamp: new Date()
              }
            : s
        )
      );

      // Track message for memory bundling (uses plaintext before it was encrypted)
      const backendUserMsg: BackendChatMessage = {
        ...userMsg,
        content, // Original plaintext
      };
      const existingMessages = session!.messages || [];
      memoryService.trackMessage(sessionIdNum, [
        ...existingMessages.map(m => ({
          id: parseInt(m.id),
          session: sessionIdNum,
          role: m.isUser ? 'user' as const : 'assistant' as const,
          content: m.content,
          timestamp: m.timestamp.getTime(),
          created_at: m.timestamp.toISOString(),
        })),
        backendUserMsg,
      ]).catch(err => console.error('Memory tracking failed:', err));

      // Create AI response message with empty content (will be filled by streaming)
      const aiMessageId = `temp_${Date.now()}`;
      const tempAiMessage: Message = {
        id: aiMessageId,
        content: '',
        isUser: false,
        timestamp: new Date()
      };

      // Add empty AI message to UI
      const sessionId = session!.id;
      setSessions(prevSessions =>
        prevSessions.map(s =>
          s.id === sessionId
            ? {
                ...s,
                messages: [...(s.messages || []), tempAiMessage]
              }
            : s
        )
      );

      // Stream the LLM response
      let fullResponse = '';
      await llmService.streamMessage(
        content,
        (chunk) => {
          fullResponse += chunk;
          // Update the AI message content with each chunk
          setSessions(prevSessions =>
            prevSessions.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: (s.messages || []).map(msg =>
                      msg.id === aiMessageId
                        ? { ...msg, content: fullResponse }
                        : msg
                    ),
                    lastMessage: fullResponse.slice(0, 100) + (fullResponse.length > 100 ? '...' : ''),
                    timestamp: new Date()
                  }
                : s
            )
          );
        },
        {
          temperature: 0.7,
          maxTokens: 2048
        }
      );

      // Send assistant message to backend (just for storage, don't update UI)
      const assistantMsg = await chatService.sendMessage(sessionIdNum, 'assistant', fullResponse);

      // Track assistant message for memory
      const backendAssistantMsg: BackendChatMessage = {
        ...assistantMsg,
        content: fullResponse, // Original plaintext
      };
      memoryService.trackMessage(sessionIdNum, [
        ...existingMessages.map(m => ({
          id: parseInt(m.id),
          session: sessionIdNum,
          role: m.isUser ? 'user' as const : 'assistant' as const,
          content: m.content,
          timestamp: m.timestamp.getTime(),
          created_at: m.timestamp.toISOString(),
        })),
        backendUserMsg,
        backendAssistantMsg,
      ]).catch(err => console.error('Memory tracking failed:', err));

      // Auto-generate title after first user-assistant interaction
      // Check if this was the first message (session had no messages before this exchange)
      if (session.messages.length === 0 && session.title === 'New Conversation') {
        try {
          console.log('Generating title for first conversation...');
          const generatedTitle = await llmService.generateTitle(content, fullResponse);
          console.log('Generated title:', generatedTitle);

          // Update title in backend
          await chatService.updateSession(sessionIdNum, generatedTitle);

          // Update title in local state
          setSessions(prevSessions =>
            prevSessions.map(s =>
              s.id === session.id
                ? { ...s, title: generatedTitle }
                : s
            )
          );
        } catch (error) {
          console.error('Failed to generate/update title:', error);
          // Don't throw - title generation is not critical
        }
      }

    } catch (error: any) {
      console.error('Failed to send message:', error);

      // Check if it's a "LLM not initialized" error
      const isLLMNotInitialized = error?.message?.includes('LLM not initialized');

      // Add error message
      const errorMessage: Message = {
        id: `error_${Date.now()}`,
        content: isLLMNotInitialized
          ? 'The AI model is not initialized yet. Please wait for initialization to complete or restart the download.'
          : `Sorry, I encountered an error: ${error.message}`,
        isUser: false,
        timestamp: new Date()
      };

      // If LLM not initialized, show download dialog
      if (isLLMNotInitialized) {
        setIsModelReady(false);
        setShowDownloadDialog(true);
      }

      setSessions(prevSessions =>
        prevSessions.map(s =>
          s.id === session!.id
            ? {
                ...s,
                messages: [...(s.messages || []), errorMessage],
                lastMessage: errorMessage.content,
                timestamp: errorMessage.timestamp
              }
            : s
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    setCurrentSessionId(null);
  };

  if (isLoadingSessions) {
    return (
      null
    );
  }

  return (
    <>
      <ModelDownloadDialog
        open={showDownloadDialog}
        onOpenChange={setShowDownloadDialog}
      />

      <div className="h-screen bg-gradient-to-br from-background via-background to-secondary/30 flex">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-3/4 left-3/4 w-64 h-64 bg-primary/8 rounded-full blur-2xl animate-pulse delay-500" />
        </div>

        {/* Sidebar */}
        <motion.div
          initial={false}
          animate={{
            width: isSidebarOpen ? 320 : 0,
            opacity: isSidebarOpen ? 1 : 0
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="relative z-10 flex-shrink-0 overflow-hidden"
        >
          <ChatSidebar
            sessions={sessions}
            currentSessionId={currentSession?.id}
            onSelectSession={setCurrentSessionId}
            onNewChat={createNewChat}
          />
        </motion.div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col relative z-10">
          <ChatHeader
            user={user}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            currentSession={currentSession}
            onSignOut={onSignOut}
          />

          <div className="flex-1 flex flex-col overflow-hidden">
            <ChatMessages
              user={user}
              messages={currentSession?.messages || []}
              isLoading={isLoadingMessages}
            />
            <ChatInput
              onSendMessage={handleSendMessage}
              disabled={isLoading || !isModelReady}
            />
          </div>
        </div>
      </div>
    </>
  );
}
