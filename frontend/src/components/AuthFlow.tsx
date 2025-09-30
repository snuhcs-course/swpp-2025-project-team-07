import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { WelcomeScreen } from './WelcomeScreen';
import { loadAuth, getProfile, clearAuth } from '@/services/auth';

type AuthState = 'login' | 'signup' | 'forgot-password' | 'welcome';

interface AuthFlowProps {
  onAuthSuccess?: () => void;
}

export function AuthFlow({ onAuthSuccess }: AuthFlowProps = {}) {
  const [authState, setAuthState] = useState<AuthState>('login');
  const [userEmail, setUserEmail] = useState('');

  const handleLoginSuccess = (email: string) => {
    setUserEmail(email);
    setAuthState('welcome');
  };

  const handleSignupSuccess = (email: string) => {
    setUserEmail(email);
    setAuthState('login');
  };

  const handleWelcomeContinue = () => {
    if (onAuthSuccess) {
      onAuthSuccess();
    } else {
      // Reset to login if no callback provided
      setAuthState('login');
      setUserEmail('');
    }
  };

  useEffect(() => {
    // Restore session if tokens exist
    const { tokens, user } = loadAuth();
    if (tokens && user) {
      (async () => {
        try {
          await getProfile(tokens.access);
          setUserEmail(user.email);
          setAuthState('welcome');
        } catch (_) {
          clearAuth();
        }
      })();
    }
  }, []);

  const variants = {
    enter: { opacity: 1, x: 0, transition: { duration: 0.4 } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.3 } }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-8">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md"
      >
        <motion.div
          key={authState}
          variants={variants}
          initial="exit"
          animate="enter"
          className="w-full"
        >
          {authState === 'login' && (
            <LoginForm
              onSwitchToSignup={() => setAuthState('signup')}
              onSwitchToForgotPassword={() => setAuthState('forgot-password')}
              onAuthSuccess={handleLoginSuccess}
            />
          )}
          {authState === 'signup' && (
            <SignupForm
              onSwitchToLogin={() => setAuthState('login')}
              onAuthSuccess={handleSignupSuccess}
            />
          )}
          {authState === 'forgot-password' && (
            <ForgotPasswordForm
              onSwitchToLogin={() => setAuthState('login')}
            />
          )}
          {authState === 'welcome' && (
            <WelcomeScreen
              email={userEmail}
              onContinue={handleWelcomeContinue}
            />
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}