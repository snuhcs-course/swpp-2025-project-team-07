import { useState } from 'react';
import { motion } from 'motion/react';
import { ChatSidebar } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { type AuthUser } from '@/services/auth';

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

  const handleSendMessage = (content: string) => {
    if (!currentSession) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      isUser: true,
      timestamp: new Date()
    };

    // Simulate AI response
    const aiResponse: Message = {
      id: (Date.now() + 1).toString(),
      content: `I understand you're asking about "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}". Let me help you with that. This is a simulated response that would normally come from your AI assistant.`,
      isUser: false,
      timestamp: new Date(Date.now() + 1000)
    };

    setSessions(prevSessions => 
      prevSessions.map(session => 
        session.id === currentSession.id
          ? {
              ...session,
              messages: [...session.messages, newMessage, aiResponse],
              lastMessage: aiResponse.content,
              timestamp: aiResponse.timestamp
            }
          : session
      )
    );
  };

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Conversation',
      lastMessage: 'How can I help you today?',
      timestamp: new Date(),
      messages: [
        {
          id: '1',
          content: 'Hello! How can I help you today?',
          isUser: false,
          timestamp: new Date()
        }
      ]
    };

    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

  return (
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
          <ChatInput onSendMessage={handleSendMessage} />
        </div>
      </div>
    </div>
  );
}