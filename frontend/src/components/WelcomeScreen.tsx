import { motion } from 'motion/react';
import { CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

interface WelcomeScreenProps {
  email: string;
  onContinue: () => void;
}

export function WelcomeScreen({ email, onContinue }: WelcomeScreenProps) {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl">
      <CardHeader className="space-y-4 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6, type: "spring", bounce: 0.4 }}
          className="mx-auto w-20 h-20 bg-green-500/10 rounded-3xl flex items-center justify-center relative"
        >
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.4 }}
            className="absolute -top-2 -right-2"
          >
            <Sparkles className="w-6 h-6 text-yellow-500" />
          </motion.div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <CardTitle className="text-2xl">Welcome aboard!</CardTitle>
          <CardDescription className="text-muted-foreground">
            Your account has been successfully created
          </CardDescription>
        </motion.div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center space-y-4"
        >
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Hi there! We're excited to have you join our Clone App.
            </p>
            <p className="text-sm text-primary">
              {email}
            </p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            className="pt-2"
          >
            <Button
              onClick={onContinue}
              className="w-full bg-primary hover:bg-primary/90 transition-all duration-200 group"
            >
              Continue to app
              <motion.div
                className="ml-2"
                whileHover={{ x: 4 }}
                transition={{ duration: 0.2 }}
              >
                <ArrowRight className="w-4 h-4" />
              </motion.div>
            </Button>
          </motion.div>
        </motion.div>
      </CardContent>
    </Card>
  );
}