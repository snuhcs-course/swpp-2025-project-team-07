import { useState, useEffect } from 'react';
import { AuthFlow } from './AuthFlow';
import { ChatInterface } from './ChatInterface';
import { clearAuth, loadAuth, type AuthUser } from '@/services/auth';

export function AppContainer() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const { tokens, user: savedUser } = loadAuth();
    if (tokens && savedUser) {
      setUser(savedUser);
      setIsAuthenticated(true);
    }
  }, []);

  const handleAuthSuccess = () => {
    const { user: savedUser } = loadAuth();
    if (savedUser) {
      setUser(savedUser);
    }
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    clearAuth();
    setUser(null);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AuthFlow onAuthSuccess={handleAuthSuccess} />;
  }

  return <ChatInterface user={user} onSignOut={handleSignOut} />;
}