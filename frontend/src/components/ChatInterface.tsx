import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChatSidebar } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ChatStatusIndicators, StopIndicator } from './ChatStatusIndicators';
import { ModelDownloadDialog } from './ModelDownloadDialog';
import { type AuthUser } from '@/services/auth';
import { llmService } from '@/services/llm';
import { chatService } from '@/services/chat';
import { memoryService } from '@/services/memory';
import { collectionService } from '@/services/collection';
import { embeddingService } from '@/services/embedding';
import { processingStatusService, type ProcessingPhaseKey, type RetrievalMetrics } from '@/services/processing-status';
import type { ChatSession as BackendChatSession, ChatMessage as BackendChatMessage } from '@/types/chat';
import { extractFramesFromVideoBlob, displayFramesInConsole, openFramesInWindow } from '@/utils/frame-extractor-browser';

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

const getTimestamp = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());

const MIN_SEARCH_DISPLAY_MS = 900;
const MIN_PROCESSING_DISPLAY_MS = 1200;

const RUN_CANCELLED_ERROR_NAME = 'RunCancelledError';

type CancellationHandle = {
  signal: Promise<never>;
  cancel: (reason?: Error) => void;
};

const createRunCancelledError = (): Error => {
  const error = new Error(RUN_CANCELLED_ERROR_NAME);
  error.name = RUN_CANCELLED_ERROR_NAME;
  return error;
};

const isRunCancelledError = (error: unknown): error is Error =>
  error instanceof Error && error.name === RUN_CANCELLED_ERROR_NAME;

const createCancellationHandle = (): CancellationHandle => {
  let rejectFn: ((reason?: Error) => void) | null = null;
  let cancelled = false;
  const signal = new Promise<never>((_, reject) => {
    rejectFn = (reason?: Error) => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      reject(reason ?? createRunCancelledError());
    };
  });

  return {
    signal,
    cancel: (reason?: Error) => {
      if (rejectFn) {
        rejectFn(reason);
      }
    },
  };
};

export type ChatRunState =
  | 'idle'
  | 'awaitingFirstToken'
  | 'streaming'
  | 'stoppedBeforeTokens'
  | 'stoppedAfterTokens'
  | 'completed';

type ActiveRunContext = {
  aiMessageId: string;
  sessionId: string;
  tokensReceived: boolean;
  isStopped: boolean;
  cancel: (reason?: Error) => void;
  cancellationSignal: Promise<never>;
};

export function ChatInterface({ user, onSignOut }: ChatInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [runState, setRunState] = useState<ChatRunState>('idle');
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isStoppingGeneration, setIsStoppingGeneration] = useState(false);

  // Ref to prevent duplicate session creation during race conditions
  const sessionCreationInProgressRef = useRef(false);
  // Ref to track if initial model check is complete
  const initialModelCheckCompleteRef = useRef(false);
  const activeRunRef = useRef<ActiveRunContext | null>(null);

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

        // Don't auto-select any session - show new chat page by default
        // Users can click on existing sessions from the sidebar if needed
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

  useEffect(() => {
    setRunState(prev => (prev === 'stoppedBeforeTokens' ? 'idle' : prev));
  }, [currentSessionId]);

  const handleSendMessage = async (content: string) => {
    if (!isModelReady) {
      return;
    }

    if (runState === 'awaitingFirstToken' || runState === 'streaming') {
      return;
    }

    // Auto-create session if none exists
    let session = currentSession;
    const cancellationHandle = createCancellationHandle();
    let activeRun: ActiveRunContext | null = {
      aiMessageId: '',
      sessionId: session?.id ?? '',
      tokensReceived: false,
      isStopped: false,
      cancel: cancellationHandle.cancel,
      cancellationSignal: cancellationHandle.signal,
    };
    activeRunRef.current = activeRun;

    const runWithCancellation = async <T>(task: () => Promise<T>): Promise<T> => {
      const promise = task();
      if (!activeRun) {
        return promise;
      }
      try {
        return await Promise.race([promise, activeRun.cancellationSignal]);
      } catch (error) {
        if (isRunCancelledError(error)) {
          promise.catch(() => undefined);
        }
        throw error;
      }
    };

    const ensureNotCancelled = () => {
      if (!activeRun || activeRun.isStopped) {
        throw createRunCancelledError();
      }
    };

    setIsStoppingGeneration(false);
    setRunState('awaitingFirstToken');
    if (!session) {
      // Check if session creation is already in progress
      // This prevents duplicate session creation in race conditions (e.g., React 18 Strict Mode double-mounting)
      if (sessionCreationInProgressRef.current) {
        console.log('Session creation already in progress, skipping duplicate call');
        setRunState('idle');
        activeRunRef.current = null;
        activeRun = null;
        return;
      }

      try {
        // Mark session creation as in progress
        sessionCreationInProgressRef.current = true;

        // Create new session synchronously
        const backendSession = await runWithCancellation(() =>
          chatService.createSession('New Conversation')
        );
        const localSession = toLocalSession(backendSession);
        setSessions(prev => [localSession, ...prev]);
        setCurrentSessionId(localSession.id);
        session = localSession;
        if (activeRun) {
          activeRun.sessionId = localSession.id;
        }
      } catch (error) {
        if (isRunCancelledError(error)) {
          return;
        }
        console.error('Failed to create session:', error);
        setRunState('idle');
        activeRunRef.current = null;
        activeRun = null;
        return;
      } finally {
        // Reset the flag after session creation
        sessionCreationInProgressRef.current = false;
      }
    }

    if (!session) {
      setRunState('idle');
      activeRunRef.current = null;
      activeRun = null;
      return;
    }

    const sessionId = session.id;
    const sessionIdNum = parseInt(sessionId, 10);

    const runStartTime = getTimestamp();
    const phaseDurations: Record<ProcessingPhaseKey, number> = {
      searching: 0,
      processing: 0,
      generating: 0,
    };
    const retrievalSummary: RetrievalMetrics = {
      memoriesRetrieved: 0,
      encryptedDataProcessed: false,
      screenRecordings: 0,
      embeddingsSearched: 0,
    };
    processingStatusService.reset(sessionId);

    if (!activeRun) {
      activeRun = {
        aiMessageId: '',
        sessionId,
        tokensReceived: false,
        isStopped: false,
        cancel: cancellationHandle.cancel,
        cancellationSignal: cancellationHandle.signal,
      };
      activeRunRef.current = activeRun;
    } else {
      activeRun.sessionId = sessionId;
    }

    try {
      // Send user message to backend (encrypted automatically)
      const userMsg = await chatService.sendMessage(sessionIdNum, 'user', content);
      ensureNotCancelled();
      const localUserMsg = toLocalMessage(userMsg);

      // Add user message to UI
      setSessions(prevSessions =>
        prevSessions.map(s =>
          s.id === sessionId
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
      const existingMessages = session.messages || [];
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

      if (activeRun) {
        activeRun.aiMessageId = aiMessageId;
      } else {
        activeRun = {
          aiMessageId,
          sessionId,
          tokensReceived: false,
          isStopped: false,
          cancel: cancellationHandle.cancel,
          cancellationSignal: cancellationHandle.signal,
        };
        activeRunRef.current = activeRun;
      }

      // RAG: Retrieve relevant context from past conversations and screen recordings
      let contextPrompt = '';
      const videoBlobs: Blob[] = []; // Store reconstructed video blobs for multimodal input
      const videoUrls: string[] = []; // Store object URLs for debugging
      const chatContexts: string[] = []; // Chat memory contexts
      let videoCount = 0; // Number of screen recordings retrieved
      let relevantDocs: any[] = [];
      let searchErrored = false;

      processingStatusService.startPhase(sessionId, 'searching');
      const searchPhaseStart = getTimestamp();

      try {
        // Generate embeddings for the user's query
        // - DRAGON (768-dim) for chat search
        // - CLIP (512-dim) for video/screen search
        const chatQueryEmbedding = await runWithCancellation(() =>
          embeddingService.embedQuery(content)
        );
        ensureNotCancelled();
        const videoQueryEmbedding = await runWithCancellation(() =>
          embeddingService.embedVideoQuery(content)
        );
        ensureNotCancelled();

        // Search and retrieve top 3 from chat + top 3 from screen (6 total max)
        // Pass separate embeddings to avoid dimension mismatch
        relevantDocs = await runWithCancellation(() =>
          collectionService.searchAndQuery(
            chatQueryEmbedding,
            3,
            videoQueryEmbedding || undefined
          )
        );
        ensureNotCancelled();

        retrievalSummary.memoriesRetrieved = relevantDocs.length;
        retrievalSummary.embeddingsSearched = relevantDocs.length;
      } catch (error) {
        if (isRunCancelledError(error)) {
          throw error;
        }
        searchErrored = true;
        console.error('Failed to retrieve context:', error);
        // Continue without context if retrieval fails
      } finally {
        let searchElapsed = getTimestamp() - searchPhaseStart;

        if (searchElapsed < MIN_SEARCH_DISPLAY_MS) {
          await runWithCancellation(
            () =>
              new Promise<void>(resolve =>
                setTimeout(resolve, MIN_SEARCH_DISPLAY_MS - searchElapsed),
              ),
          );
          ensureNotCancelled();
          searchElapsed = MIN_SEARCH_DISPLAY_MS;
        }

        phaseDurations.searching = searchElapsed;

        const searchMessages = searchErrored
          ? ['Secure search encountered an issue']
          : relevantDocs.length > 0
            ? ['Secure search completed']
            : ['Secure search completed (no matches found)'];

        processingStatusService.completePhase(sessionId, 'searching', searchElapsed, {
          retrievalMetrics: {
            memoriesRetrieved: relevantDocs.length,
            embeddingsSearched: relevantDocs.length,
            encryptedDataProcessed: false,
          },
          securityMessages: searchMessages,
        });
      }

      processingStatusService.startPhase(sessionId, 'processing');
      const secureProcessingStart = getTimestamp();
      let processingErrored = false;

      try {
        if (relevantDocs.length > 0) {
          // Separate chat and video contexts

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
                },
                // Extract and preview frames sent to LLM
                frames: async (fps = 1, maxFrames = 50) => {
                  console.log(
                    `[Frame Extractor] Extracting frames from video ${videoCount} at ${fps} fps...`
                  );
                  const frames = await extractFramesFromVideoBlob(doc.video_blob, fps, maxFrames);
                  console.log(`[Frame Extractor] Extracted ${frames.length} frames`);
                  displayFramesInConsole(frames);
                  return frames;
                },
                // Open frames in new window
                viewFrames: async (fps = 1, maxFrames = 50) => {
                  console.log(`[Frame Extractor] Extracting frames from video ${videoCount}...`);
                  const frames = await extractFramesFromVideoBlob(doc.video_blob, fps, maxFrames);
                  openFramesInWindow(frames);
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
${chatContexts.join('\n')}
${chatContexts.length > 0 && videoCount > 0 ? '\n' : ''}
${videoCount > 0 ? `You also have ${videoCount} relevant screen recording(s) provided as image frame sequences. Each recording is split into frames at 1 frame per second, so you'll see multiple images showing the progression of activity over time.` : ''}

</CONTEXT>

**Now, using the above context${videoCount > 0 ? ' and screen recording frames' : ''}, answer the following question**:
`;
          }
        }
      } catch (error) {
        if (isRunCancelledError(error)) {
          throw error;
        }
        processingErrored = true;
        console.error('Failed to process retrieved context:', error);
      } finally {
        let secureProcessingElapsed = getTimestamp() - secureProcessingStart;

        if (secureProcessingElapsed < MIN_PROCESSING_DISPLAY_MS) {
          await runWithCancellation(
            () =>
              new Promise<void>(resolve =>
                window.setTimeout(resolve, MIN_PROCESSING_DISPLAY_MS - secureProcessingElapsed),
              ),
          );
          ensureNotCancelled();
          secureProcessingElapsed = MIN_PROCESSING_DISPLAY_MS;
        }

        phaseDurations.processing = secureProcessingElapsed;

        const secureMessages: string[] = ['Processing encrypted data'];
        if (processingErrored) {
          secureMessages.push('Secure processing encountered an issue');
        } else if (videoCount > 0) {
          secureMessages.push(
            `Prepared ${videoCount} secure screen capture${videoCount === 1 ? '' : 's'}`
          );
        }

        retrievalSummary.memoriesRetrieved = chatContexts.length + videoCount;
        retrievalSummary.screenRecordings = videoCount;
        if (retrievalSummary.memoriesRetrieved > 0 && !processingErrored) {
          retrievalSummary.encryptedDataProcessed = true;
        }

        processingStatusService.completePhase(sessionId, 'processing', secureProcessingElapsed, {
          retrievalMetrics: {
            memoriesRetrieved: retrievalSummary.memoriesRetrieved,
            screenRecordings: videoCount,
            embeddingsSearched: retrievalSummary.embeddingsSearched,
            encryptedDataProcessed: retrievalSummary.encryptedDataProcessed,
          },
          securityMessages: secureMessages,
        });
      }

      // Stream the LLM response with RAG context + videos
      let fullResponse = '';
      const messageWithContext = contextPrompt + content;

      // Log RAG summary
      console.log('[RAG] Context retrieval complete:', {
        chatMemories: chatContexts.length,
        screenRecordings: videoCount,
        contextLength: contextPrompt.length,
        totalPromptLength: messageWithContext.length
      });

      // Expose the final prompt for debugging in console
      (window as any).__ragPrompt = {
        full: messageWithContext,
        userQuery: content,
        contextAdded: contextPrompt.length > 0,
        contextLength: contextPrompt.length,
        totalLength: messageWithContext.length,
        chatMemories: chatContexts.length,
        videoCount: videoCount,
        videos: videoBlobs, // Store video blobs for frame extraction
        view: () => {
          console.log('=== RAG Prompt Debug ===');
          console.log('User Query:', content);
          console.log('\nContext Added:', contextPrompt.length > 0 ? 'Yes' : 'No');
          console.log('Chat Memories:', chatContexts.length);
          console.log('Screen Recordings:', videoCount);
          console.log('\n--- Full Prompt ---');
          console.log(messageWithContext);
          console.log('\n--- Context Only ---');
          console.log(contextPrompt);
        },
        copy: () => {
          navigator.clipboard.writeText(messageWithContext);
          console.log('✓ Full prompt copied to clipboard');
        },
        // Extract frames from all videos
        frames: async (fps = 1, maxFrames = 50) => {
          if (videoBlobs.length === 0) {
            console.log('No videos attached to this query');
            return [];
          }
          console.log(`[Frame Extractor] Extracting frames from ${videoBlobs.length} video(s) at ${fps} fps...`);
          const allFrames = [];
          for (let i = 0; i < videoBlobs.length; i++) {
            console.log(`\n[Frame Extractor] Processing video ${i + 1}/${videoBlobs.length}...`);
            const frames = await extractFramesFromVideoBlob(videoBlobs[i], fps, maxFrames);
            console.log(`[Frame Extractor] Video ${i + 1}: ${frames.length} frames`);
            displayFramesInConsole(frames);
            allFrames.push(...frames);
          }
          console.log(`\n[Frame Extractor] Total: ${allFrames.length} frames from ${videoBlobs.length} video(s)`);
          return allFrames;
        },
        // Open all frames in new window
        viewFrames: async (fps = 1, maxFrames = 50) => {
          if (videoBlobs.length === 0) {
            console.log('No videos attached to this query');
            return;
          }
          console.log(`[Frame Extractor] Extracting frames from ${videoBlobs.length} video(s)...`);
          const allFrames = [];
          for (const videoBlob of videoBlobs) {
            const frames = await extractFramesFromVideoBlob(videoBlob, fps, maxFrames);
            allFrames.push(...frames);
          }
          console.log(`[Frame Extractor] Opening ${allFrames.length} frames in new window...`);
          openFramesInWindow(allFrames);
        }
      };
      if (videoCount > 0) {
        console.log('[RAG] Debug: __ragPrompt.view() | __ragPrompt.frames() | __ragPrompt.viewFrames()');
        console.log(`[RAG] Debug: Individual videos: __ragVideo1.frames() | __ragVideo1.viewFrames()`);
      } else {
        console.log('[RAG] Debug: Use __ragPrompt.view() to inspect prompt or __ragPrompt.copy() to copy it');
      }

      // Convert video Blobs to ArrayBuffers for IPC transfer
      const videoArrayBuffers = videoBlobs.length > 0
        ? await runWithCancellation(() =>
            Promise.all(videoBlobs.map(blob => blob.arrayBuffer())),
          )
        : undefined;
      ensureNotCancelled();

      if (videoArrayBuffers && videoArrayBuffers.length > 0) {
        console.log(`[RAG] Sending ${videoArrayBuffers.length} video(s) to LLM for frame extraction`);
        console.log(`[RAG] Video sizes:`, videoArrayBuffers.map((buf, i) => `Video ${i + 1}: ${(buf.byteLength / 1024).toFixed(1)} KB`));
      } else {
        console.log('[RAG] No videos attached to this query');
      }

      processingStatusService.startPhase(sessionId, 'generating');
      const generationPhaseStart = getTimestamp();
      let generatedChunks = 0;
      let generatedCharacters = 0;
      let streamingErrored = false;
      let tokensAnnounced = false;

      ensureNotCancelled();
      try {
        await runWithCancellation(() =>
          llmService.streamMessage(
            messageWithContext,
            (chunk) => {
              const currentRun = activeRunRef.current;
              if (!currentRun || currentRun.isStopped) {
                return;
              }

              if (!currentRun.tokensReceived) {
                currentRun.tokensReceived = true;
                if (!tokensAnnounced) {
                  tokensAnnounced = true;
                  processingStatusService.tokensStarted(sessionId);
                }
                setRunState('streaming');
              }

              generatedChunks += 1;
              generatedCharacters += chunk.length;
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
          )
        );
      } catch (streamError) {
        streamingErrored = true;
        throw streamError;
      } finally {
        const generationElapsed = getTimestamp() - generationPhaseStart;
        phaseDurations.generating = generationElapsed;
        processingStatusService.completePhase(sessionId, 'generating', generationElapsed, {
          generatedChunks,
          generatedCharacters,
          retrievalMetrics: {
            memoriesRetrieved: retrievalSummary.memoriesRetrieved,
            encryptedDataProcessed: retrievalSummary.encryptedDataProcessed,
            screenRecordings: retrievalSummary.screenRecordings,
            embeddingsSearched: retrievalSummary.embeddingsSearched,
          },
        });

        if (!streamingErrored) {
          processingStatusService.completeProcessing(sessionId, {
            totalElapsedMs: getTimestamp() - runStartTime,
            phaseBreakdown: phaseDurations,
            retrievalMetrics: {
              memoriesRetrieved: retrievalSummary.memoriesRetrieved,
              encryptedDataProcessed: retrievalSummary.encryptedDataProcessed,
              screenRecordings: retrievalSummary.screenRecordings,
              embeddingsSearched: retrievalSummary.embeddingsSearched,
            },
          });
        }
      }

      // Cleanup initial video object URLs (blobs remain accessible via window.__ragVideoN)
      videoUrls.forEach(url => URL.revokeObjectURL(url));

      if (activeRun?.isStopped) {
        return;
      }

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

      setRunState('completed');

    } catch (error: any) {
      const rawErrorMessage =
        typeof error === 'string'
          ? error
          : error instanceof Error
            ? error.message
            : (error?.message as string | undefined);
      const isStreamCancelled =
        (error instanceof Error && error.name === 'StreamCancelledError') ||
        (typeof rawErrorMessage === 'string' && rawErrorMessage.includes('StreamCancelledError'));
      const isRunCancelled =
        (error instanceof Error && isRunCancelledError(error)) ||
        (typeof rawErrorMessage === 'string' && rawErrorMessage.includes(RUN_CANCELLED_ERROR_NAME));

      if (isStreamCancelled || isRunCancelled) {
        // Stop requested - nothing else to do
      } else {
        console.error('Failed to send message:', error);
        const safeMessage = rawErrorMessage ?? 'Failed to process message';
        processingStatusService.fail(
          sessionId,
          safeMessage
        );

        // Check if it's a "LLM not initialized" error
        const isLLMNotInitialized = safeMessage.includes('LLM not initialized');

        // Add error message
        const errorMessagePayload: Message = {
          id: `error_${Date.now()}`,
          content: isLLMNotInitialized
            ? 'The AI model is not initialized yet. Please wait for initialization to complete or restart the download.'
            : `Sorry, I encountered an error: ${safeMessage}`,
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
            s.id === sessionId
              ? {
                  ...s,
                  messages: [...(s.messages || []), errorMessagePayload],
                  lastMessage: errorMessagePayload.content,
                  timestamp: errorMessagePayload.timestamp
                }
              : s
          )
        );

        setRunState('idle');
      }
    } finally {
      activeRun = null;
      activeRunRef.current = null;
    }
  };

  const handleStopGeneration = async () => {
    const activeRun = activeRunRef.current;
    if (!activeRun || activeRun.isStopped) {
      return;
    }

    activeRun.isStopped = true;

    const stoppingBeforeTokens = !activeRun.tokensReceived;
    if (stoppingBeforeTokens) {
      activeRun.cancel();
    }

    if (!activeRun.tokensReceived && activeRun.aiMessageId) {
      setSessions(prevSessions =>
        prevSessions.map(s =>
          s.id === activeRun.sessionId
            ? {
                ...s,
                messages: (s.messages || []).filter(msg => msg.id !== activeRun.aiMessageId),
              }
            : s
        )
      );
    }

    if (stoppingBeforeTokens) {
      setIsStoppingGeneration(true);
    }

    if (activeRun.sessionId) {
      processingStatusService.reset(activeRun.sessionId);
    }
    setRunState(stoppingBeforeTokens ? 'stoppedBeforeTokens' : 'stoppedAfterTokens');

    try {
      await llmService.stopStreaming();
    } catch (error) {
      console.error('Failed to stop streaming:', error);
    } finally {
      if (stoppingBeforeTokens) {
        setIsStoppingGeneration(false);
      }
    }
  };

  const createNewChat = () => {
    setCurrentSessionId(null);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // Call backend to delete session
      await chatService.deleteSession(Number(sessionId));

      // Remove session from local state
      setSessions(prevSessions => prevSessions.filter(s => s.id !== sessionId));

      // If deleted session is current session, show empty chat state
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const indicatorSessionId = currentSession?.id ?? activeRunRef.current?.sessionId ?? null;

  let statusIndicatorNode: ReactNode = null;
  if (runState === 'awaitingFirstToken') {
    statusIndicatorNode = <ChatStatusIndicators sessionId={indicatorSessionId} />;
  } else if (runState === 'stoppedBeforeTokens') {
    statusIndicatorNode = <StopIndicator isStopping={isStoppingGeneration} />;
  }

  if (isLoadingSessions) {
    return (
      null
    );
  }

  return (
    <>
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
            onDeleteSession={handleDeleteSession}
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
              statusIndicator={statusIndicatorNode}
            />
            <ChatInput
              onSendMessage={handleSendMessage}
              onStop={handleStopGeneration}
              runState={runState}
              inputDisabled={!isModelReady}
            />
          </div>
        </div>
      </div>
    </>
  );
}
