import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChatSidebar } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ModelDownloadDialog } from './ModelDownloadDialog';
import { type AuthUser } from '@/services/auth';
import { llmService } from '@/services/llm';

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

export function ChatInterface({ user, onSignOut }: ChatInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: '1',
      title: 'Project Planning Assistant',
      lastMessage: 'How can I help you with your project?',
      timestamp: new Date(),
      messages: [
        {
          id: '1',
          content: 'Hello! How can I help you with your project planning today?',
          isUser: false,
          timestamp: new Date()
        }
      ]
    },
    {
      id: '2',
      title: 'Code Review Helper',
      lastMessage: 'Let me review that code for you',
      timestamp: new Date(Date.now() - 3600000),
      messages: [
        {
          id: '1',
          content: 'Can you help me review this React component?',
          isUser: true,
          timestamp: new Date(Date.now() - 3600000)
        },
        {
          id: '2',
          content: 'Of course! Please share the code and I\'ll provide a detailed review.',
          isUser: false,
          timestamp: new Date(Date.now() - 3500000)
        }
      ]
    }
  ]);

  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

  useEffect(() => {
    // Check model status on mount
    const checkModelStatus = async () => {
      try {
        const status = await window.llmAPI.checkModelDownloaded();

        if (!status.downloaded) {
          // Model not downloaded, show download dialog
          setShowDownloadDialog(true);
          setIsModelReady(false);
        } else if (status.initialized) {
          // Model is downloaded and initialized
          setIsModelReady(true);
          setShowDownloadDialog(false);
        } else {
          // Model is downloaded but not yet initialized
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
    if (!currentSession || isLoading || !isModelReady) return;

    // Create user message
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      isUser: true,
      timestamp: new Date()
    };

    // Add user message to session
    setSessions(prevSessions =>
      prevSessions.map(session =>
        session.id === currentSession.id
          ? {
              ...session,
              messages: [...session.messages, newMessage],
              lastMessage: content,
              timestamp: newMessage.timestamp
            }
          : session
      )
    );

    setIsLoading(true);

    try {
      // Create AI response message with empty content (will be filled by streaming)
      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage: Message = {
        id: aiMessageId,
        content: '',
        isUser: false,
        timestamp: new Date()
      };

      // Add empty AI message
      setSessions(prevSessions =>
        prevSessions.map(session =>
          session.id === currentSession.id
            ? {
                ...session,
                messages: [...session.messages, aiMessage]
              }
            : session
        )
      );

      // Stream the response
      let fullResponse = '';
      await llmService.streamMessage(
        content,
        (chunk) => {
          fullResponse += chunk;
          // Update the AI message content with each chunk
          setSessions(prevSessions =>
            prevSessions.map(session =>
              session.id === currentSession.id
                ? {
                    ...session,
                    messages: session.messages.map(msg =>
                      msg.id === aiMessageId
                        ? { ...msg, content: fullResponse }
                        : msg
                    ),
                    lastMessage: fullResponse.slice(0, 100) + (fullResponse.length > 100 ? '...' : ''),
                    timestamp: new Date()
                  }
                : session
            )
          );
        },
        {
          temperature: 0.7,
          maxTokens: 2048
        }
      );

    } catch (error: any) {
      console.error('Failed to get LLM response:', error);

      // Check if it's a "LLM not initialized" error
      const isLLMNotInitialized = error?.message?.includes('LLM not initialized');

      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        content: isLLMNotInitialized
          ? 'The AI model is not initialized yet. Please wait for initialization to complete or restart the download.'
          : 'Sorry, I encountered an error. Please make sure the AI model is loaded and try again.',
        isUser: false,
        timestamp: new Date()
      };

      // If LLM not initialized, show download dialog
      if (isLLMNotInitialized) {
        setIsModelReady(false);
        setShowDownloadDialog(true);
      }

      setSessions(prevSessions =>
        prevSessions.map(session =>
          session.id === currentSession.id
            ? {
                ...session,
                messages: [...session.messages, errorMessage],
                lastMessage: errorMessage.content,
                timestamp: errorMessage.timestamp
              }
            : session
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Conversation',
      lastMessage: 'How can I help you today?',
      timestamp: new Date(),
      messages: []
    };

    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

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
          <ChatMessages user={user} messages={currentSession?.messages || []} />
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