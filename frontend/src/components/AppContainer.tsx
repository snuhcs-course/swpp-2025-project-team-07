import { useState } from 'react';
import { AuthFlow } from './AuthFlow';
import { ChatInterface } from './ChatInterface';
import { clearAuth } from '@/services/auth';

export function AppContainer() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    clearAuth();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AuthFlow onAuthSuccess={handleAuthSuccess} />;
  }

  return <ChatInterface onSignOut={handleSignOut} />;
}