import { useState } from 'react';
import { AuthFlow } from './AuthFlow';
import { ChatInterface } from './ChatInterface';

export function AppContainer() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <AuthFlow onAuthSuccess={handleAuthSuccess} />;
  }

  return <ChatInterface />;
}