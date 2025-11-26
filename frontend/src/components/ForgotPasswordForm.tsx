import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, KeyRound, ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { requestPasswordReset, confirmPasswordReset } from '@/services/auth';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export function ForgotPasswordForm({ onSwitchToLogin }: ForgotPasswordFormProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  console.log('Rendering ForgotPasswordForm, email:', email);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');

  const validateEmail = () => {
    if (!email) return 'Email is required';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Please enter a valid email';
    return '';
  };

  const validateReset = () => {
    const newErrors: Record<string, string> = {};
    if (!otp) newErrors.otp = 'OTP is required';
    if (otp.length !== 6) newErrors.otp = 'OTP must be 6 digits';
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }
 
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Validating email:', email);
    const emailError = validateEmail();
    console.log('Email error:', emailError);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      await requestPasswordReset(email);
      setStep('otp');
      setSuccessMessage('Code sent! Check your email.');
    } catch (err: any) {
      setErrors({ form: err.message || 'Failed to send code' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateReset()) return;

    setIsLoading(true);
    setErrors({});
    try {
      await confirmPasswordReset(email, otp, password);
      setSuccessMessage('Password reset successfully!');
      setTimeout(() => {
        onSwitchToLogin();
      }, 2000);
    } catch (err: any) {
      setErrors({ form: err.message || 'Failed to reset password' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl overflow-hidden">
      <CardHeader className="space-y-4 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center"
        >
          <KeyRound className="w-8 h-8 text-primary" />
        </motion.div>
        <div>
          <CardTitle className="text-2xl">Reset Password</CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === 'email' 
              ? "Enter your email to receive a reset code" 
              : "Enter the code and your new password"}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <AnimatePresence mode="wait">
          {step === 'email' ? (
            <form key="email-form" onSubmit={handleRequestOtp} noValidate className="space-y-4">
              {errors.form && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-md border border-destructive/60 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive"
                >
                  {errors.form}
                </motion.div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); }}
                    className={`pl-10 bg-input-background border-border/50 focus:border-primary/50 transition-colors ${
                      errors.email ? 'border-destructive' : ''
                    }`}
                  />
                </div>
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive"
                  >
                    {errors.email}
                  </motion.p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Code'} <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </form>
          ) : (
            <motion.form
              key="otp-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleConfirmReset}
              className="space-y-4"
            >
              {successMessage && (
                <div className="rounded-md border border-green-500/60 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-500">
                  {successMessage}
                </div>
              )}
              {errors.form && (
                <div className="rounded-md border border-destructive/60 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
                  {errors.form}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="otp">6-Digit Code</Label>
                <Input
                  id="otp"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  className={`pl-10 pr-10 bg-input-background border-border/50 focus:border-primary/50 transition-colors ${
                    errors.otp ? 'border-destructive' : ''
                  }`}
                />
                {errors.otp && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive"
                  >
                    {errors.otp}
                  </motion.p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`pl-10 pr-10 bg-input-background border-border/50 focus:border-primary/50 transition-colors ${
                      errors.password ? 'border-destructive' : ''
                    }`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters and include uppercase, lowercase, and a number.
                </p>
                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive"
                  >
                    {errors.password}
                  </motion.p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`pl-10 pr-10 bg-input-background border-border/50 focus:border-primary/50 transition-colors ${
                      errors.confirmPassword ? 'border-destructive' : ''
                    }`}
                  />
                </div>
                {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
              
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full" 
                onClick={() => setStep('email')}
                disabled={isLoading}
              >
                <ArrowLeft className="mr-2 w-4 h-4" /> Back to Email
              </Button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-4 text-center">
          <button
            onClick={onSwitchToLogin}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      </CardContent>
    </Card>
  );
}