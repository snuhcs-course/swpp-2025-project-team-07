import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Mail, Send, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export function ForgotPasswordForm({ onSwitchToLogin }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    return /\S+@\S+\.\S+/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError('Email is required');
      return;
    }
    
    if (!validateEmail(email)) {
      setError('Please enter a valid email');
      return;
    }
    
    setError('');
    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsLoading(false);
    setIsEmailSent(true);
  };

  const handleResendEmail = async () => {
    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsLoading(false);
  };

  if (isEmailSent) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
            className="mx-auto w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center"
          >
            <CheckCircle className="w-8 h-8 text-green-500" />
          </motion.div>
          <div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription className="text-muted-foreground">
              We've sent a password reset link to {email}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="text-center space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Click the link in the email to reset your password. If you don't see it, check your spam folder.
            </p>
            
            <div className="space-y-3">
              <Button
                onClick={handleResendEmail}
                variant="outline"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full mr-2"
                  />
                ) : null}
                Resend email
              </Button>
              
              <Button
                onClick={onSwitchToLogin}
                variant="ghost"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to sign in
              </Button>
            </div>
          </motion.div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
      <CardHeader className="space-y-4 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center"
        >
          <Send className="w-8 h-8 text-primary" />
        </motion.div>
        <div>
          <CardTitle className="text-2xl">Reset password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your email and we'll send you a reset link
          </CardDescription>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                className={`pl-10 bg-input-background border-border/50 focus:border-primary/50 transition-colors ${
                  error ? 'border-destructive' : ''
                }`}
              />
            </div>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-destructive"
              >
                {error}
              </motion.p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 transition-all duration-200"
            disabled={isLoading}
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full"
              />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send reset link
              </>
            )}
          </Button>
        </form>

        <div className="text-center">
          <Button
            onClick={onSwitchToLogin}
            variant="ghost"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to sign in
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}