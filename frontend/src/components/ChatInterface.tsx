import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ChatSidebar } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ModelDownloadDialog } from './ModelDownloadDialog';
import VideoModelDownloadDialog from './VideoModelDownloadDialog';
import { type AuthUser } from '@/services/auth';
import { llmService } from '@/services/llm';
import { useRecorderWithEmbed } from '@/recording/provider';
import { chatService } from '@/services/chat';
import { memoryService } from '@/services/memory';
import { collectionService } from '@/services/collection';
import { embeddingService } from '@/services/embedding';
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
  const { stopAndEmbed } = useRecorderWithEmbed();
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [videoReady, setVideoReady] = useState<boolean | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // Ref to prevent duplicate session creation during race conditions
  const sessionCreationInProgressRef = useRef(false);
  // Ref to track if initial model check is complete
  const initialModelCheckCompleteRef = useRef(false);

  const currentSession = currentSessionId
    ? sessions.find(s => s.id === currentSessionId)
    : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ready = await window.vembedAPI.isModelReady();
        if (cancelled) return;
        setVideoReady(ready);
        setVideoOpen(!ready); // 없으면 모달 오픈
      } catch {
        if (cancelled) return;
        setVideoReady(false);
        setVideoOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    const checkModelStatus = async () => {
      try {
        // Wait a bit for backend initialization to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        const status = await window.llmAPI.checkModelDownloaded();

        // Mark initial check as complete
        initialModelCheckCompleteRef.current = true;
        setIsCheckingModels(false);

        if (!status.downloaded) {
          // Only show dialog if models are truly not downloaded
          setShowDownloadDialog(true);
          setIsModelReady(false);
        } else if (status.initialized) {
          setIsModelReady(true);
          setShowDownloadDialog(false);
        } else {
          // Models downloaded but not initialized yet - wait for llm:ready event
          setIsModelReady(false);
          setShowDownloadDialog(false);
        }
      } catch (error) {
        console.error('Failed to check model status:', error);
        setIsCheckingModels(false);
        initialModelCheckCompleteRef.current = true;
      }
    };

    checkModelStatus();

    // Listen for model status events
    const handleModelNotFound = () => {
      // Only show dialog if initial check is complete
      // This prevents flashing the dialog during startup network errors
      if (initialModelCheckCompleteRef.current) {
        setShowDownloadDialog(true);
        setIsModelReady(false);
      }
    };

    const handleLLMReady = () => {
      setIsModelReady(true);
      setShowDownloadDialog(false);
      setIsCheckingModels(false);
    };

    const handleLLMError = (error: { message: string; error: string }) => {
      console.error('LLM Error:', error);
      setIsModelReady(false);
    };

    window.llmAPI.onModelNotFound(handleModelNotFound);
    window.llmAPI.onLLMReady(handleLLMReady);
    window.llmAPI.onLLMError(handleLLMError);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleSendMessage = async (content: string) => {
    if (isLoading || !isModelReady) return;

    // Auto-create session if none exists
    let session = currentSession;
    if (!session) {
      // Check if session creation is already in progress
      // This prevents duplicate session creation in race conditions (e.g., React 18 Strict Mode double-mounting)
      if (sessionCreationInProgressRef.current) {
        console.log('Session creation already in progress, skipping duplicate call');
        return;
      }

      try {
        // Mark session creation as in progress
        sessionCreationInProgressRef.current = true;

        // Create new session synchronously
        const backendSession = await chatService.createSession('New Conversation');
        const localSession = toLocalSession(backendSession);
        setSessions(prev => [localSession, ...prev]);
        setCurrentSessionId(localSession.id);
        session = localSession;
      } catch (error) {
        console.error('Failed to create session:', error);
        return;
      } finally {
        // Reset the flag after session creation
        sessionCreationInProgressRef.current = false;
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

      // RAG: Retrieve relevant context from past conversations and screen recordings
      let contextPrompt = '';
      const videoBlobs: Blob[] = []; // Store reconstructed video blobs for multimodal input
      const videoUrls: string[] = []; // Store object URLs for debugging
      try {
        // Generate embeddings for the user's query
        // - DRAGON (768-dim) for chat search
        // - CLIP (512-dim) for video/screen search
        const chatQueryEmbedding = await embeddingService.embedQuery(content);
        const videoQueryEmbedding = await embeddingService.embedVideoQuery(content);

        // Search and retrieve top 3 from chat + top 3 from screen (6 total max)
        // Pass separate embeddings to avoid dimension mismatch
        const relevantDocs = await collectionService.searchAndQuery(
          chatQueryEmbedding,
          3,
          videoQueryEmbedding || undefined
        );

        if (relevantDocs.length > 0) {
          // Separate chat and video contexts
          const chatContexts: string[] = [];
          let videoCount = 0;

          relevantDocs.forEach((doc: any, idx: number) => {
            if (doc.source_type === 'screen' && doc.video_blob) {
              // Store reconstructed video blob for multimodal input
              videoBlobs.push(doc.video_blob);
              videoCount++;

              // Create object URL for debugging
              const videoUrl = URL.createObjectURL(doc.video_blob);
              videoUrls.push(videoUrl);

              // Store on window for debugging access
              const videoKey = `__ragVideo${videoCount}`;
              (window as any)[videoKey] = {
                url: videoUrl,
                blob: doc.video_blob,
                download: () => {
                  const freshUrl = URL.createObjectURL(doc.video_blob);
                  const a = document.createElement('a');
                  a.href = freshUrl;
                  a.download = `rag-video-${videoCount}-${Date.now()}.webm`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(freshUrl), 100);
                },
                view: () => {
                  const freshUrl = URL.createObjectURL(doc.video_blob);
                  window.open(freshUrl, '_blank');
                }
              };

              console.log(`[RAG] Retrieved video ${videoCount}: ${(doc.video_blob.size / 1024).toFixed(1)} KB`);
            } else if (doc.source_type === 'chat') {
              chatContexts.push(`[Memory ${idx + 1}]:\n${doc.content}`);
            }
          });

          // Build context prompt with <CONTEXT> tags matching the chat RAG style
          if (chatContexts.length > 0 || videoCount > 0) {
            contextPrompt = `<CONTEXT>
The following are relevant excerpts from the user's past conversations with you.
These are your memories of previous interactions.
You can use this information to answer the user's question.

${chatContexts.join('\n\n')}${chatContexts.length > 0 && videoCount > 0 ? '\n\n' : ''}${videoCount > 0 ? `You also have ${videoCount} relevant screen recording(s) provided as video input.` : ''}

</CONTEXT>

**Now, using the above context${videoCount > 0 ? ' and video(s)' : ''}, answer the following question**:
`;
          }
        }
      } catch (error) {
        console.error('Failed to retrieve context:', error);
        // Continue without context if retrieval fails
      }

      // Stream the LLM response with RAG context + videos
      let fullResponse = '';
      const messageWithContext = contextPrompt + content;

      // Convert video Blobs to ArrayBuffers for IPC transfer
      const videoArrayBuffers = videoBlobs.length > 0
        ? await Promise.all(videoBlobs.map(blob => blob.arrayBuffer()))
        : undefined;

      await llmService.streamMessage(
        messageWithContext,
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
          maxTokens: 2048,
          videos: videoArrayBuffers, // Pass video ArrayBuffers (IPC-compatible) to Gemma 3n
        }
      );

      // Cleanup initial video object URLs (blobs remain accessible via window.__ragVideoN)
      videoUrls.forEach(url => URL.revokeObjectURL(url));

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
      <VideoModelDownloadDialog
        open={videoOpen}
        onOpenChange={(o) => {
          setVideoOpen(o);
          if (!o) setVideoReady(true); // 닫힘 = 다운로드 완료로 간주
        }}
      />
      {/* Only show download dialog after initial model check is complete */}
      {!isCheckingModels && (
        <ModelDownloadDialog
          open={showDownloadDialog}
          onOpenChange={setShowDownloadDialog}
        />
      )}

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
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
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
