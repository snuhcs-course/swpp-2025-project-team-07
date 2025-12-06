import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { ChatSidebar } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { ChatStatusIndicators, StopIndicator } from './ChatStatusIndicators';
import { ModelDownloadDialog } from './ModelDownloadDialog';
import { VideoPlayerModal } from './VideoPlayerModal';
import type { LLMProviderType } from '@/types/electron';
import { type AuthUser } from '@/services/auth';
import { llmService } from '@/services/llm';
import { chatService } from '@/services/chat';
import { memoryService } from '@/services/memory';
import { collectionService } from '@/services/collection';
import { embeddingService } from '@/services/embedding';
import { processingStatusService, type ProcessingPhaseKey, type RetrievalMetrics } from '@/services/processing-status';
import { sampleUniformFramesAsBase64, sampleUniformFrames } from '@/embedding/video-sampler';
import { queryTransformationService, type TransformedQuery } from '@/services/query-transformation';
import type { ChatSession as BackendChatSession, ChatMessage as BackendChatMessage } from '@/types/chat';
import { extractFramesFromVideoBlob, displayFramesInConsole, openFramesInWindow } from '@/utils/frame-extractor-browser';
import type { VideoCandidate } from '@/types/video';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { OnboardingTooltip } from './OnboardingTooltip';

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
const MAX_VIDEO_CANDIDATES = 18;
const MAX_VIDEO_SELECTION = 3;

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

const buildContextPrompt = (chatContexts: string[], selectedVideoCount: number): string => {
  if (chatContexts.length === 0 && selectedVideoCount === 0) {
    return '';
  }

  const lines: string[] = [];
  if (chatContexts.length > 0) {
    lines.push(chatContexts.join('\n\n'));
  }
  if (selectedVideoCount > 0) {
    lines.push(
      `${selectedVideoCount} screen recording${selectedVideoCount === 1 ? '' : 's'} selected by the user for visual reasoning (1 fps).`
    );
  }

  return ['<memory>', lines.join('\n'), '</memory>'].join('\n');
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

type VideoSequenceItem = {
  id: string;
  blob: Blob;
  durationMs?: number;
  timestamp?: number;
  video_set_id?: string | null;
  url?: string;
  order?: number;
};

type VideoDoc = {
  id: string; // Represents the video set id when available
  blob: Blob; // Representative video blob for the set
  durationMs?: number;
  timestamp?: number;
  video_set_id?: string | null;
  representative_id?: string;
  sequence?: VideoSequenceItem[]; // Ordered videos in the set
};

type PendingGenerationData = {
  sessionId: string;
  sessionIdNum: number;
  aiMessageId: string;
  conversationMessages: { role: 'user' | 'assistant'; content: string }[];
  chatContexts: string[];
  videoDocs: VideoDoc[];
  userMessageContent: string;
  userMsg: BackendChatMessage;
  runStartTime: number;
  phaseDurations: Record<ProcessingPhaseKey, number>;
  retrievalSummary: RetrievalMetrics;
  shouldGenerateTitle: boolean;
  videoDebugUrls: string[];
  responseGuidance?: string;
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
  const [videoCandidates, setVideoCandidates] = useState<VideoCandidate[]>([]);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [isRetrievalComplete, setIsRetrievalComplete] = useState(false);
  const [isGenerationInProgress, setIsGenerationInProgress] = useState(false);
  const [videoSearchUsed, setVideoSearchUsed] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<{
    url: string;
    id: string;
    sequence?: VideoCandidate['sequence'];
    title?: string;
  } | null>(null);

  // Video RAG toggle state - enabled by default, persisted in localStorage
  const [videoRagEnabled, setVideoRagEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('videoRagEnabled');
    return stored ? JSON.parse(stored) : true;
  });

  // Save videoRagEnabled to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('videoRagEnabled', JSON.stringify(videoRagEnabled));
  }, [videoRagEnabled]);

  // Model selection state - per-session + default, persisted in localStorage
  const [sessionModels, setSessionModels] = useState<Record<string, LLMProviderType>>(() => {
    const stored = localStorage.getItem('sessionModels');
    return stored ? JSON.parse(stored) : {};
  });
  const [defaultModel, setDefaultModel] = useState<LLMProviderType>(() => {
    const stored = localStorage.getItem('defaultModel');
    return (stored === 'openai' || stored === 'ollama') ? stored : 'ollama';
  });
  // Save sessionModels to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sessionModels', JSON.stringify(sessionModels));
  }, [sessionModels]);

  // Save defaultModel to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('defaultModel', defaultModel);
  }, [defaultModel]);

  // Get current session's selected model, or default if no session
  const currentModel: LLMProviderType = currentSessionId
    ? sessionModels[currentSessionId] || defaultModel
    : defaultModel;

  // Onboarding state
  const [runTour, setRunTour] = useState(false);
  const [tourSteps] = useState<Step[]>([
    {
      target: '.tour-recording-button',
      title: 'Start recording',
      content: 'Record your screen to share context with Clone.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '.tour-chat-input',
      title: 'Chat with Clone',
      content: 'Ask Clone about things you want to recall from screen recordings or your past chat history.',
      placement: 'top',
    },
    {
      target: '.tour-video-search',
      title: 'Toggle video search',
      content: "Enable searching through your screen recordings for more context, disable it for faster responses.",
      placement: 'top',
    },
  ]);

  useEffect(() => {
    const onboardingCompleted = localStorage.getItem('onboarding_completed');
    console.log("checking onboarding", onboardingCompleted);
    if (onboardingCompleted !== 'true') {
      setRunTour(true);
    }
  }, []);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRunTour(false);
      localStorage.setItem('onboarding_completed', 'true');
    }
  };

  // Query transformation state
  const [queryTransformEnabled, setQueryTransformEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('queryTransformEnabled');
    return stored ? JSON.parse(stored) : true; // Enabled by default
  });

  // Save queryTransformEnabled to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('queryTransformEnabled', JSON.stringify(queryTransformEnabled));
  }, [queryTransformEnabled]);

  // Expose query transformation controls to console for debugging
  useEffect(() => {
    (window as any).__queryTransform = {
      enabled: queryTransformEnabled,
      toggle: () => {
        setQueryTransformEnabled(prev => !prev);
        console.log(`Query transformation ${!queryTransformEnabled ? 'enabled' : 'disabled'}`);
      },
    };
  }, [queryTransformEnabled]);

  // Ref to prevent duplicate session creation during race conditions
  const sessionCreationInProgressRef = useRef(false);
  // Ref to track if initial model check is complete
  const initialModelCheckCompleteRef = useRef(false);
  const activeRunRef = useRef<ActiveRunContext | null>(null);
  const candidatePreviewUrlsRef = useRef<Map<string, string>>(new Map());
  const videoSelectionResolverRef = useRef<((ids: string[]) => void) | null>(null);
  const videoSelectionRejectRef = useRef<((error?: Error) => void) | null>(null);

  const clearCandidatePreviewUrls = () => {
    candidatePreviewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    candidatePreviewUrlsRef.current.clear();
  };

  const resetVideoSelectionState = () => {
    clearCandidatePreviewUrls();
    setVideoCandidates([]);
    setSelectedVideoIds([]);
    setSelectedVideoIds([]);
    setIsRetrievalComplete(false);
    setIsGenerationInProgress(false);
    setVideoSearchUsed(false);
    videoSelectionResolverRef.current = null;
    videoSelectionRejectRef.current = null;
  };

  const currentSession = currentSessionId
    ? sessions.find(s => s.id === currentSessionId)
    : undefined;

  useEffect(() => {
    return () => {
      clearCandidatePreviewUrls();
    };
  }, []);

  // Initialize LLM session with system prompt once model is ready
  useEffect(() => {
    if (!isModelReady) return;

    const initializeLLMSession = async () => {
      try {
        // Create LLM session with system prompt from backend
        await llmService.createSession();
        console.log('[ChatInterface] LLM session initialized with Clone system prompt');
      } catch (error) {
        console.error('[ChatInterface] Failed to initialize LLM session:', error);
      }
    };

    initializeLLMSession();
  }, [isModelReady]);

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

  const runGeneration = async (
    pendingData: PendingGenerationData,
    selectedIds: string[],
  ) => {
    const {
      sessionId,
      sessionIdNum,
      aiMessageId,
      conversationMessages,
      chatContexts,
      videoDocs,
      userMessageContent,
      userMsg,
      runStartTime,
      phaseDurations,
      retrievalSummary,
      shouldGenerateTitle,
      videoDebugUrls,
      responseGuidance,
    } = pendingData;

    const selectedDocs =
      selectedIds.length > 0
        ? videoDocs.filter(doc => selectedIds.includes(doc.id))
        : [];
    const contextPrompt = buildContextPrompt(chatContexts, selectedDocs.length);

    // Build message with context using array join for explicit newlines
    const messageParts: string[] = [];

    // Add response guidance if available (from query transformation)
    if (responseGuidance) {
      messageParts.push(['<instructions>', responseGuidance, '</instructions>'].join('\n'));
    }

    // Add retrieved context (memories and videos)
    if (contextPrompt) {
      messageParts.push(contextPrompt);
    }

    // Add user query
    messageParts.push(userMessageContent);

    const messageWithContext = messageParts.join('\n\n');

    let fullResponse = '';

    const debugVideoBlobs = selectedDocs.flatMap(doc => doc.sequence?.map(item => item.blob) ?? [doc.blob]);
    const debugVideoSets = selectedDocs.map(doc => ({
      setId: doc.video_set_id ?? doc.id,
      representativeId: doc.representative_id ?? doc.id,
      sequence: (doc.sequence ?? []).map(item => ({
        id: item.id,
        order: item.order,
        url: item.url,
      })),
    }));
    (window as any).__ragPrompt = {
      full: messageWithContext,
      userQuery: userMessageContent,
      contextAdded: Boolean(contextPrompt),
      contextLength: contextPrompt.length,
      totalLength: messageWithContext.length,
      chatMemories: chatContexts.length,
      videoCount: selectedDocs.length,
      conversationHistory: conversationMessages,
      videos: debugVideoBlobs,
      videoSets: debugVideoSets,
      responseGuidance: responseGuidance,
      view: () => {
        console.log('=== RAG Prompt Debug ===');
        console.log('User Query:', userMessageContent);
        console.log('\nResponse Guidance:', responseGuidance || 'None');
        console.log('\nContext Added:', contextPrompt.length > 0 ? 'Yes' : 'No');
        console.log('Chat Memories:', chatContexts.length);
        console.log('Selected Videos:', selectedDocs.length);
        console.log('\n--- Full Prompt ---');
        console.log(messageWithContext);
        console.log('\n--- Response Guidance ---');
        console.log(responseGuidance || 'None');
        console.log('\n--- Context Only ---');
        console.log(contextPrompt);
      },
      copy: () => {
        navigator.clipboard.writeText(messageWithContext);
        console.log('Full prompt copied to clipboard');
      },
      frames: async (fps = 1, maxFrames = 50) => {
        if (debugVideoBlobs.length === 0) {
          console.log('No videos attached to this query');
          return [];
        }
        console.log(`[Frame Extractor] Extracting frames from ${debugVideoBlobs.length} video(s) at ${fps} fps...`);
        const allFrames = [];
        for (let i = 0; i < debugVideoBlobs.length; i++) {
          console.log(`\n[Frame Extractor] Processing video ${i + 1}/${debugVideoBlobs.length}...`);
          const frames = await extractFramesFromVideoBlob(debugVideoBlobs[i], fps, maxFrames);
          console.log(`[Frame Extractor] Video ${i + 1}: ${frames.length} frames`);
          displayFramesInConsole(frames);
          allFrames.push(...frames);
        }
        console.log(`\n[Frame Extractor] Total: ${allFrames.length} frames from ${debugVideoBlobs.length} video(s)`);
        return allFrames;
      },
      viewFrames: async (fps = 1, maxFrames = 50) => {
        if (debugVideoBlobs.length === 0) {
          console.log('No videos attached to this query');
          return;
        }
        console.log(`[Frame Extractor] Extracting frames from ${debugVideoBlobs.length} video(s)...`);
        const allFrames = [];
        for (const videoBlob of debugVideoBlobs) {
          const frames = await extractFramesFromVideoBlob(videoBlob, fps, maxFrames);
          allFrames.push(...frames);
        }
        console.log(`[Frame Extractor] Opening ${allFrames.length} frames in new window...`);
        openFramesInWindow(allFrames);
      },
      debugVLMFrames: async () => {
        if (selectedDocs.length === 0) {
          console.log('No videos to sample.');
          return;
        }
        console.log('[VLM Debug] Sampling frames exactly as sent to LLM');

        // videoSamplingTargets -> selectedDocs 로 변경
        const allSamples = await Promise.all(
          selectedDocs.map(async (doc, idx) => {
            const frames = await sampleUniformFramesAsBase64(
               doc.blob,
               1,
               { keepOriginal: true, format: 'image/jpeg', quality: 0.8 }
            );
            return { idx, frames, setId: doc.video_set_id ?? doc.id };
          })
        );

        // 팝업 창 생성
        const win = window.open('', '_blank');
        if(!win) return console.error('Popup blocked. Please allow popups.');

        let html = `
          <html>
          <head>
            <title>VLM Input Debug (Actual Sampling)</title>
            <style>
              body { background:#111; color:#eee; font-family:sans-serif; padding:20px; }
              .video-row { margin-bottom:30px; border-bottom:1px solid #444; padding-bottom:20px; }
              .frames-grid { display:flex; gap:8px; flex-wrap:wrap; }
              .frame-item { text-align:center; }
              img { width:112px; height:112px; object-fit:contain; border:1px solid #555; background:#000; }
              .meta { font-size: 12px; color: #aaa; margin-top: 4px; }
              h3 { color: #4ade80; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <h1>VLM Input Frames Debug</h1>
            <p>Showing frames exactly as processed for the LLM (224x224px, resized/squashed).</p>
        `;

        allSamples.forEach(({idx, frames, setId}) => {
          html += `
            <div class="video-row">
              <h3>Video #${idx + 1} ${setId ? `<span style="color:#888;font-size:0.8em">(${setId})</span>` : ''}</h3>
              <div class="frames-grid">`;
          
          frames.forEach((f, fIdx) => {
               // sampleUniformFramesAsBase64의 리턴값 구조에 따라 f.base64, f.time 사용
               html += `
                <div class="frame-item">
                  <img src="data:image/jpeg;base64,${f.base64}" />
                  <div class="meta">Frame ${fIdx + 1}<br/>${f.time ? f.time.toFixed(2) + 's' : ''}</div>
                </div>`;
          });
          
          html += `</div></div>`;
        });

        html += '</body></html>';
        win.document.write(html);
        win.document.close();
      }
    
    };

    if (selectedDocs.length > 0) {
      console.log('[RAG] Selected video sets ready. Use __ragPrompt.view() or __ragPrompt.frames() for debugging.');
    } else {
      console.log('[RAG] No videos attached to this query');
    }

    const sampledFrames = selectedDocs.length > 0
      ? await Promise.all(
          selectedDocs.map(async (doc) => {
            try {
              const frames = await sampleUniformFramesAsBase64(
                doc.blob,
                1,
                { keepOriginal: true, format: 'image/jpeg', quality: 0.8 }
              );
              const frame = frames[0];
              if (frame) {
                console.log(
                  `[VLM] Sampled 1 frame from representative of set ${doc.video_set_id ?? doc.id}`
                );
              }
              return frame?.base64;
            } catch (error) {
              console.error('[VLM] Failed to sample representative frame', error);
              return undefined;
            }
          })
        )
      : [];
    const vlmImages = sampledFrames.filter((frame): frame is string => Boolean(frame));

    if (vlmImages.length > 0) {
      console.log(
        `[RAG] Sending ${vlmImages.length} representative frame(s) from ${selectedDocs.length} video set(s) to LLM`
      );
    } else if (selectedDocs.length > 0) {
      console.warn('[RAG] No frames sampled from selected video sets; continuing without visual input');
    }

    setIsGenerationInProgress(true);
    setIsRetrievalComplete(false);
    setVideoCandidates([]);
    clearCandidatePreviewUrls();
    setVideoSearchUsed(false);

    processingStatusService.startPhase(sessionId, 'generating');
    const generationPhaseStart = getTimestamp();
    let generatedChunks = 0;
    let generatedCharacters = 0;
    let streamingErrored = false;
    let tokensAnnounced = false;

    const updatedRetrievalSummary: RetrievalMetrics = {
      ...retrievalSummary,
      screenRecordings: selectedDocs.length,
    };

    try {
      await llmService.streamMessage(
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
          images: vlmImages.length > 0 ? vlmImages : undefined,
          messages: conversationMessages,
          provider: currentModel,
        }
      );
    } catch (error) {
      streamingErrored = true;
      throw error;
    } finally {
      const generationElapsed = getTimestamp() - generationPhaseStart;
      phaseDurations.generating = generationElapsed;
      processingStatusService.completePhase(sessionId, 'generating', generationElapsed, {
        generatedChunks,
        generatedCharacters,
        retrievalMetrics: updatedRetrievalSummary,
      });

      if (!streamingErrored) {
        processingStatusService.completeProcessing(sessionId, {
          totalElapsedMs: getTimestamp() - runStartTime,
          phaseBreakdown: phaseDurations,
          retrievalMetrics: updatedRetrievalSummary,
        });
      }

      setIsGenerationInProgress(false);
    }

    videoDebugUrls.forEach(url => URL.revokeObjectURL(url));

    if (activeRunRef.current?.isStopped) {
      return;
    }

    const assistantMsg = await chatService.sendMessage(sessionIdNum, 'assistant', fullResponse);
    const latestSession = sessions.find(s => s.id === sessionId);
    const existingMessages = latestSession?.messages || [];
    const backendUserMsg: BackendChatMessage = {
      ...userMsg,
      content: userMessageContent,
    };
    const backendAssistantMsg: BackendChatMessage = {
      ...assistantMsg,
      content: fullResponse,
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

    if (shouldGenerateTitle) {
      try {
        console.log('Generating title for first conversation...');
        const generatedTitle = await llmService.generateTitle(userMessageContent, fullResponse);
        console.log('Generated title:', generatedTitle);
        await chatService.updateSession(sessionIdNum, generatedTitle);
        setSessions(prevSessions =>
          prevSessions.map(s =>
            s.id === sessionId
              ? { ...s, title: generatedTitle }
              : s
          )
        );
      } catch (titleError) {
        console.error('Failed to generate/update title:', titleError);
      }
    }

    setRunState('completed');
  };

  const handleToggleVideoSelection = (id: string) => {
    setSelectedVideoIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(existing => existing !== id);
      }
      if (prev.length >= MAX_VIDEO_SELECTION) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleOpenVideoPreview = (id: string) => {
    const candidate = videoCandidates.find(video => video.id === id);
    if (candidate) {
      setPreviewVideo({
        id,
        url: candidate.videoUrl,
        sequence: candidate.sequence,
        title: candidate.videoSetId ? `Video set ${candidate.videoSetId}` : undefined,
      });
    }
  };

  const handleClosePreview = () => setPreviewVideo(null);

  const buildVideoCandidateList = (docs: VideoDoc[]): VideoCandidate[] => {
    clearCandidatePreviewUrls();
    const visibleDocs = docs.slice(0, MAX_VIDEO_CANDIDATES);

    return visibleDocs.map(doc => {
      const representativeUrl =
        doc.sequence?.[0]?.url ??
        (() => {
          const createdUrl = URL.createObjectURL(doc.blob);
          candidatePreviewUrlsRef.current.set(`${doc.id}:rep`, createdUrl);
          return createdUrl;
        })();

      const sequence = (doc.sequence ?? []).map(item => {
        const seqUrl = item.url ?? URL.createObjectURL(item.blob);
        candidatePreviewUrlsRef.current.set(`${doc.id}:${item.id}:${item.order ?? 0}`, seqUrl);
        return {
          id: item.id,
          url: seqUrl,
          order: item.order,
          durationMs: item.durationMs,
          timestamp: item.timestamp,
        };
      });

      return {
        id: doc.id,
        thumbnailUrl: representativeUrl,
        videoUrl: representativeUrl,
        score: 0,
        videoBlob: doc.blob,
        durationMs: doc.durationMs,
        timestamp: doc.timestamp,
        videoSetId: doc.video_set_id ?? doc.id,
        representativeId: doc.representative_id,
        sequenceLength: sequence.length || 1,
        sequence,
      };
    });
  };

  const handleGenerateWithSelectedVideos = () => {
    if (!videoSelectionResolverRef.current) {
      return;
    }
    if (selectedVideoIds.length === 0 || selectedVideoIds.length > MAX_VIDEO_SELECTION) {
      return;
    }
    const resolver = videoSelectionResolverRef.current;
    videoSelectionResolverRef.current = null;
    videoSelectionRejectRef.current = null;
    resolver(selectedVideoIds);
  };

  const handleSendMessage = async (content: string) => {
    if (!isModelReady) {
      return;
    }

    if (runState === 'awaitingFirstToken' || runState === 'streaming') {
      return;
    }

    resetVideoSelectionState();
    setVideoSearchUsed(videoRagEnabled);

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

    const runWithCancellation = async <T, >(task: () => Promise<T>): Promise<T> => {
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

        // Create new backend session for database storage
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
      understanding: 0,
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

    const videoDocsForSelection: VideoDoc[] = [];
    const videoUrls: Set<string> = new Set(); // Store object URLs for debugging/cleanup
    const chatContexts: string[] = [];
    let videoSetCount = 0;
    let relevantDocs: any[] = [];
    let searchErrored = false;

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

      // =========================================================================
      // QUERY TRANSFORMATION LAYER
      // =========================================================================
      let transformedQuery: TransformedQuery | null = null;
      let chatSearchQuery = content; // Default to raw content if transformation is disabled
      let videoSearchQuery = content; // Default to raw content if transformation is disabled

      if (queryTransformEnabled && videoRagEnabled) {
        processingStatusService.startPhase(sessionId, 'understanding');
        const understandPhaseStart = getTimestamp();
        try {
          console.log('[QueryTransform] Starting query transformation...');

          // Build context for transformation
          const conversationHistory = session.messages
            .slice(-6) // Last 3 turns (6 messages)
            .map(msg => ({
              role: msg.isUser ? ('user' as const) : ('assistant' as const),
              content: msg.content,
            }));

          // Transform query
          transformedQuery = await queryTransformationService.transformQuery({
            current_query: content,
            conversation_history: conversationHistory,
          });

          // Use transformed query for search - different queries for chat vs video
          if (transformedQuery) {
            chatSearchQuery = queryTransformationService.getChatSearchQuery(content, transformedQuery);
            videoSearchQuery = queryTransformationService.getVideoSearchQuery(content, transformedQuery);
            console.log('[QueryTransform] Using transformed queries:', {
              original: content,
              chatQuery: chatSearchQuery,
              videoQuery: videoSearchQuery,
              confidence: transformedQuery.confidence_score,
            });
          }
        } catch (error) {
          console.error('[QueryTransform] Transformation failed, falling back to original query:', error);
          // Continue with original query if transformation fails
          transformedQuery = null;
          chatSearchQuery = content;
          videoSearchQuery = content;
        } finally {
          const understandElapsed = getTimestamp() - understandPhaseStart;
          phaseDurations.understanding = understandElapsed;
          processingStatusService.completePhase(sessionId, 'understanding', understandElapsed, {
            retrievalMetrics: {
              memoriesRetrieved: retrievalSummary.memoriesRetrieved,
              encryptedDataProcessed: retrievalSummary.encryptedDataProcessed,
              screenRecordings: retrievalSummary.screenRecordings,
              embeddingsSearched: retrievalSummary.embeddingsSearched,
            },
          });
        }
      }

      // =========================================================================
      // RAG: Retrieve relevant context from past conversations and screen recordings
      // =========================================================================
      processingStatusService.startPhase(sessionId, 'searching');
      const searchPhaseStart = getTimestamp();

      try {
        // Generate embeddings for the search queries (potentially transformed)
        // - DRAGON (768-dim) for chat search - uses keywords + action context
        // - CLIP (512-dim) for video/screen search - uses keywords + visual cues
        const chatQueryEmbedding = await runWithCancellation(() =>
          embeddingService.embedQuery(chatSearchQuery)
        );
        ensureNotCancelled();

        const videoQueryEmbedding = videoRagEnabled
          ? await runWithCancellation(() =>
              embeddingService.embedVideoQuery(videoSearchQuery)
            )
          : undefined;

        if (videoRagEnabled) {
          ensureNotCancelled();
        }

        // Search and retrieve top 7 from chat + top 3 from screen
        // Pass separate embeddings to avoid dimension mismatch
        // Exclude current session to avoid redundancy with conversation history
        relevantDocs = await runWithCancellation(() =>
          collectionService.searchAndQuery(
            chatQueryEmbedding,
            7,
            videoQueryEmbedding || undefined,
            videoRagEnabled ? MAX_VIDEO_CANDIDATES : 0,
            sessionIdNum,
            'video_set'
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
          ? [`Secure search encountered an issue`]
          : relevantDocs.length > 0
            ? [`Secure search completed`]
            : [`Secure search completed (no matches found)`];

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
          const seenMessages = new Map<string, { role: string; content: string }>();

          relevantDocs.forEach((doc: any, idx: number) => {
            if (doc.source_type === 'screen' && doc.video_blob) {
              const setId = (doc.video_set_id ?? doc.id ?? `video_set_${idx + 1}`).toString();
              const rawSequence = Array.isArray(doc.video_set_videos) && doc.video_set_videos.length > 0
                ? doc.video_set_videos
                : [doc];

              const sequenceVideos: VideoSequenceItem[] = [];
              rawSequence.forEach((video: any, order: number) => {
                if (!video?.video_blob) return;
                const url = URL.createObjectURL(video.video_blob);
                videoUrls.add(url);
                sequenceVideos.push({
                  id: video.id?.toString() ?? `${setId}_${order}`,
                  blob: video.video_blob,
                  durationMs: video.duration,
                  timestamp: video.timestamp,
                  video_set_id: video.video_set_id ?? setId,
                  url,
                  order,
                });
              });

              if (sequenceVideos.length === 0) {
                console.warn('[RAG] Skipping video set with no blobs', setId);
                return;
              }

              const representativeId = doc.representative_id ?? doc.id?.toString();
              const representativeVideo =
                sequenceVideos.find(v => v.id === representativeId) ?? sequenceVideos[0];

              videoDocsForSelection.push({
                id: setId,
                blob: representativeVideo.blob,
                durationMs: representativeVideo.durationMs,
                timestamp: representativeVideo.timestamp,
                video_set_id: setId,
                representative_id: representativeId,
                sequence: sequenceVideos,
              });

              videoSetCount += 1;

              const debugKey = `__ragVideoSet${videoSetCount}`;

              const openDebugPopup = (title: string, contentHtml: string) => {
                const win = window.open('', '_blank', 'width=500,height=500');
                if (!win) return console.error('Popup blocked');
                win.document.write(`
                  <html>
                    <head><title>${title}</title></head>
                    <body style="background:#111;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
                      <h3 style="margin-bottom:10px;color:#4ade80">${title}</h3>
                      ${contentHtml}
                    </body>
                  </html>
                `);
                win.document.close();
              };

              (window as any)[debugKey] = {
                videos: sequenceVideos,
                representative: representativeVideo,

                view: () => {
                  openDebugPopup(
                    `Video Set ${videoSetCount} - Representative`, 
                    `<video src="${representativeVideo.url}" controls autoplay style="max-width:100%;max-height:80vh;border:1px solid #444"></video>
                     <p style="font-size:12px;color:#aaa;margin-top:10px">ID: ${representativeVideo.id}</p>`
                  );
                },

                embeddingFrame: async () => {
                  console.log(`[Debug] Extracting embedding frame for ${representativeVideo.id}...`);
                  try {
                    const frames = await sampleUniformFrames(representativeVideo.blob, 1, { size: 224 });
                    const frame = frames[0];
                    if (!frame) return console.error('No frame extracted');

                    const canvas = document.createElement('canvas');
                    canvas.width = 224;
                    canvas.height = 224;
                    const ctx = canvas.getContext('2d');
                    if (frame.image instanceof ImageData) {
                       ctx?.putImageData(frame.image, 0, 0);
                    } else {
                       ctx?.drawImage(frame.image as any, 0, 0, 224, 224);
                    }
                    
                    openDebugPopup(
                      `Embedding Input (Simulated)`,
                      `<img src="${canvas.toDataURL()}" style="width:224px;height:224px;border:2px solid #f00;" />
                       <p style="font-size:12px;color:#aaa;margin-top:10px">Logic: sampleUniformFrames (Squashed 224px)</p>`
                    );
                  } catch (e) { console.error(e); }
                },

                promptFrame: async () => {
                  console.log(`[Debug] Extracting VLM frame for ${representativeVideo.id}...`);
                  try {
                    const frames = await sampleUniformFramesAsBase64(
                      representativeVideo.blob, 
                      1, 
                      { keepOriginal: true, format: 'image/jpeg', quality: 0.8 }
                    );
                    const base64 = frames[0]?.base64;
                    if (!base64) return console.error('No frame extracted');

                    openDebugPopup(
                      `VLM Input (Actual)`,
                      `<img src="data:image/jpeg;base64,${base64}" style="width:224px;height:224px;border:2px solid #00f;" />
                       <p style="font-size:12px;color:#aaa;margin-top:10px">Logic: sampleUniformFramesAsBase64 (JPEG q=0.8)</p>`
                    );
                  } catch (e) { console.error(e); }
                },
                
                viewSequence: () => {
                  const win = window.open('', '_blank');
                  if (!win) return console.error('Popup blocked');
                  const scripts = `
                    const videos = ${JSON.stringify(sequenceVideos.map(v => v.url))};
                    let idx = 0;
                    const player = document.getElementById('player');
                    const label = document.getElementById('label');
                    function playNext() {
                      if (idx >= videos.length) { label.innerText = 'Done'; return; }
                      const url = videos[idx];
                      label.innerText = 'Playing ' + (idx + 1) + ' / ' + videos.length;
                      player.src = url;
                      player.play();
                      idx += 1;
                    }
                    player.onended = playNext;
                    playNext();
                  `;
                  win.document.write(`
                    <html><body style="margin:0;background:#111;color:#eee;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px">
                      <div id="label">Loading...</div>
                      <video id="player" controls autoplay style="max-width:95vw;max-height:85vh;background:black;border:1px solid #444;border-radius:8px"></video>
                      <script>${scripts}</script>
                    </body></html>
                  `);
                },
              };
              console.log(
                `[RAG] Retrieved video set ${videoSetCount} (${sequenceVideos.length} video${
                  sequenceVideos.length === 1 ? '' : 's'
                }): ${debugKey}.viewSequence()`
              );
            } else if (doc.source_type === 'chat') {
              // Parse bundle to extract individual messages
              // Bundle format: "user: content\nassistant: content\nuser: content\n..."
              const lines = doc.content.split('\n');

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                // Match "role: content" pattern
                const match = trimmedLine.match(/^(user|assistant):\s*(.+)$/);
                if (match) {
                  const [, role, content] = match;
                  const messageKey = `${role}:${content}`;

                  // Only add if not seen before
                  if (!seenMessages.has(messageKey)) {
                    seenMessages.set(messageKey, { role, content });
                  }
                }
              }
            }
          });

          // Reconstruct deduplicated chat contexts from individual messages
          // Group into user-assistant pairs with empty lines between them
          if (seenMessages.size > 0) {
            const deduplicatedMessages = Array.from(seenMessages.values());
            const formattedLines: string[] = [];

            for (let i = 0; i < deduplicatedMessages.length; i++) {
              const msg = deduplicatedMessages[i];
              formattedLines.push(`${msg.role}: ${msg.content}`);

              // Add empty line after assistant messages (end of user-assistant pair)
              if (msg.role === 'assistant' && i < deduplicatedMessages.length - 1) {
                formattedLines.push('');
              }
            }

            chatContexts.push(formattedLines.join('\n'));
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
        } else if (videoSetCount > 0) {
          secureMessages.push(
            `Prepared ${videoSetCount} retrieved video set${videoSetCount === 1 ? '' : 's'}`
          );
        }

        retrievalSummary.memoriesRetrieved = chatContexts.length + videoSetCount;
        retrievalSummary.screenRecordings = videoSetCount;
        if (retrievalSummary.memoriesRetrieved > 0 && !processingErrored) {
          retrievalSummary.encryptedDataProcessed = true;
        }

        processingStatusService.completePhase(sessionId, 'processing', secureProcessingElapsed, {
          retrievalMetrics: {
            memoriesRetrieved: retrievalSummary.memoriesRetrieved,
            screenRecordings: videoSetCount,
            embeddingsSearched: retrievalSummary.embeddingsSearched,
            encryptedDataProcessed: retrievalSummary.encryptedDataProcessed,
          },
          securityMessages: secureMessages,
        });
      }

      // Prepare generation payload and handle video selection
      const conversationMessages = session.messages
        .filter(msg => msg.id !== aiMessageId)
        .map(msg => ({
          role: msg.isUser ? 'user' as const : 'assistant' as const,
          content: msg.content
        }));

      const pendingData: PendingGenerationData = {
        sessionId,
        sessionIdNum,
        aiMessageId,
        conversationMessages,
        chatContexts,
        videoDocs: videoDocsForSelection,
        userMessageContent: content,
        userMsg,
        runStartTime,
        phaseDurations,
        retrievalSummary,
        shouldGenerateTitle: session.messages.length === 0 && session.title === 'New Conversation',
        videoDebugUrls: Array.from(videoUrls),
        responseGuidance: transformedQuery?.response_guidance,
      };

      let selectedIdsForRun: string[] = [];

      if (videoRagEnabled && videoDocsForSelection.length > 0) {
        setVideoCandidates(buildVideoCandidateList(videoDocsForSelection));
        setSelectedVideoIds([]);
        setIsRetrievalComplete(true);

        selectedIdsForRun = await new Promise<string[]>((resolve, reject) => {
          videoSelectionResolverRef.current = resolve;
          videoSelectionRejectRef.current = reject;
        });
        ensureNotCancelled();
      } else if (videoRagEnabled) {
        setIsRetrievalComplete(true);
      }

      ensureNotCancelled();
      await runGeneration(pendingData, selectedIdsForRun);

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
      videoUrls.forEach(url => URL.revokeObjectURL(url));
      activeRun = null;
      activeRunRef.current = null;
    }
  };

  const handleStopGeneration = async () => {
    if (videoSelectionRejectRef.current) {
      videoSelectionRejectRef.current(createRunCancelledError());
      resetVideoSelectionState();
    }

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

  const handleToggleVideoRag = () => {
    setVideoRagEnabled(prev => !prev);
  };

  // Model selection handlers
  const handleSelectModel = (model: LLMProviderType) => {
    // Update default model (used when no session is selected)
    setDefaultModel(model);

    // Also update the current session if one exists
    if (currentSessionId) {
      setSessionModels(prev => ({
        ...prev,
        [currentSessionId]: model,
      }));
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
  const hasVideoCandidates = videoCandidates.length > 0;
  const showVideoGrid = hasVideoCandidates && isRetrievalComplete && !isGenerationInProgress;

  let statusIndicatorNode: ReactNode = null;
  if (runState === 'awaitingFirstToken') {
    statusIndicatorNode = (
      <ChatStatusIndicators
        sessionId={indicatorSessionId}
        videoCandidates={videoCandidates}
        selectedVideoIds={selectedVideoIds}
        onToggleVideoSelection={handleToggleVideoSelection}
        onOpenVideo={handleOpenVideoPreview}
        onGenerateWithSelectedVideos={handleGenerateWithSelectedVideos}
        showVideoGrid={showVideoGrid}
        isRetrievalComplete={isRetrievalComplete}
        videoSearchActive={videoSearchUsed}
        isGenerationInProgress={isGenerationInProgress}
        provider={currentModel}
      />
    );
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
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showProgress
        showSkipButton
        callback={handleJoyrideCallback}
        tooltipComponent={OnboardingTooltip}
        disableOverlayClose={true}
        disableCloseOnEsc={true}
        styles={{
          options: {
            zIndex: 1000,
            overlayColor: 'rgba(0, 0, 0, 0.8)',
          },
        }}
      />
      {/* Only show download dialog after initial model check is complete */}
      {!isCheckingModels && (
        <ModelDownloadDialog
          open={showDownloadDialog}
          onOpenChange={setShowDownloadDialog}
        />
      )}

      <div className="h-screen bg-linear-to-br from-background via-background to-secondary/30 flex">
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

          <motion.div
            className="flex-1 flex flex-col overflow-hidden"
            layout
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          >
            <div
              className={
                (!currentSession?.messages || currentSession.messages.length === 0)
                  ? 'pt-[calc(50vh-13rem)] overflow-auto min-h-0'
                  : 'flex-1 flex flex-col overflow-auto min-h-0'
              }
            >
              <ChatMessages
                user={user}
                messages={currentSession?.messages || []}
                isLoading={isLoadingMessages}
                statusIndicator={statusIndicatorNode}
              />
            </div>
            <div className="flex-shrink-0">
              <ChatInput
                onSendMessage={handleSendMessage}
                onStop={handleStopGeneration}
                runState={runState}
                modelNotReady={!isModelReady}
                isStopping={isStoppingGeneration}
                videoRagEnabled={videoRagEnabled}
                onToggleVideoRag={handleToggleVideoRag}
                selectedModel={currentModel}
                onSelectModel={handleSelectModel}
              />
            </div>
          </motion.div>
        </div>
      </div>

      <VideoPlayerModal
        open={Boolean(previewVideo)}
        videoUrl={previewVideo?.url ?? null}
        sequence={previewVideo?.sequence}
        title={previewVideo?.title}
        onClose={handleClosePreview}
      />
    </>
  );
}
