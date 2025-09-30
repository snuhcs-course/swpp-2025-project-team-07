import { useState } from 'react';
import { motion } from 'motion/react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Avatar, AvatarFallback } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { 
  User, 
  Settings, 
  Bell, 
  Palette, 
  Shield, 
  HelpCircle,
  Moon,
  Sun,
  Monitor
} from 'lucide-react';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabValue = 'profile' | 'appearance' | 'privacy';

const tabs = [
  { value: 'profile' as TabValue, label: 'Profile', icon: User },
  { value: 'appearance' as TabValue, label: 'Appearance', icon: Palette },
  { value: 'privacy' as TabValue, label: 'Privacy', icon: Shield },
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('profile');
  
  const [profile, setProfile] = useState({
    name: 'Alex Johnson',
    email: 'alex.johnson@example.com',
  });

  const [preferences, setPreferences] = useState({
    theme: 'dark',
    autoSave: true,
    soundEffects: false,
    compactMode: false
  });

  const handleProfileUpdate = (field: string, value: string) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handlePreferenceToggle = (preference: string) => {
    setPreferences(prev => ({ 
      ...prev, 
      [preference]: !prev[preference as keyof typeof preferences] 
    }));
  };

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium mb-6">Profile Settings</h3>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="name" className="text-sm">Full Name</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) => handleProfileUpdate('name', e.target.value)}
                    className="bg-accent/30 border-border/50 rounded-xl transition-all duration-300 focus:bg-accent/50"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="email" className="text-sm">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => handleProfileUpdate('email', e.target.value)}
                    className="bg-accent/30 border-border/50 rounded-xl transition-all duration-300 focus:bg-accent/50"
                  />
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'appearance':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium mb-6">Appearance</h3>
              
              <div className="space-y-8">
                <div className="space-y-4">
                  <Label className="text-sm">Theme</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {themeOptions.map((option) => {
                      const IconComponent = option.icon;
                      return (
                        <motion.button
                          key={option.value}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setPreferences(prev => ({ ...prev, theme: option.value }))}
                          className={`p-4 rounded-xl border transition-all duration-300 ${
                            preferences.theme === option.value
                              ? 'border-primary bg-primary/10 shadow-sm'
                              : 'border-border/50 hover:border-border bg-accent/20 hover:bg-accent/40'
                          }`}
                        >
                          <IconComponent className="w-6 h-6 mx-auto mb-2" />
                          <p className="text-sm">{option.label}</p>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <Separator className="bg-border/30" />

                <div className="space-y-6">
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <Label className="text-sm">Compact Mode</Label>
                      <p className="text-xs text-muted-foreground">Use smaller UI elements</p>
                    </div>
                    <Switch
                      checked={preferences.compactMode}
                      onCheckedChange={() => handlePreferenceToggle('compactMode')}
                    />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <Label className="text-sm">Sound Effects</Label>
                      <p className="text-xs text-muted-foreground">Play sounds for interactions</p>
                    </div>
                    <Switch
                      checked={preferences.soundEffects}
                      onCheckedChange={() => handlePreferenceToggle('soundEffects')}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'privacy':
        return (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-medium mb-6">Privacy & Security</h3>
              
              <div className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full justify-start bg-accent/20 hover:bg-accent/40 rounded-xl transition-all duration-300"
                >
                  <Shield className="w-4 h-4 mr-3" />
                  Export My Data
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start bg-accent/20 hover:bg-accent/40 rounded-xl transition-all duration-300"
                >
                  <HelpCircle className="w-4 h-4 mr-3" />
                  Privacy Policy
                </Button>
                
                <Separator className="bg-border/30 my-6" />
                
                <Button 
                  variant="destructive" 
                  className="w-full rounded-xl transition-all duration-300"
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[90vw] max-w-[1000px] min-w-[800px] h-[85vh] max-h-[700px] min-h-[500px] p-0 bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full h-full"
        >
          {/* Header */}
          <div className="flex items-center p-6 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center">
                <Settings className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-xl font-medium">Settings</h2>
            </div>
          </div>

          <div className="flex h-[calc(100%-73px)]">
            {/* Left Sidebar */}
            <div className="w-64 border-r border-border/30 bg-accent/10">
              <nav className="p-4 space-y-2">
                {tabs.map((tab) => {
                  const IconComponent = tab.icon;
                  return (
                    <motion.button
                      key={tab.value}
                      whileHover={{ x: 4 }}
                      onClick={() => setActiveTab(tab.value)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        activeTab === tab.value
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'hover:bg-accent/30 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                      <span className="text-sm">{tab.label}</span>
                    </motion.button>
                  );
                })}
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
              <ScrollArea className="flex-1 p-8">
                {renderTabContent()}
              </ScrollArea>

              {/* Footer */}
              <div className="flex justify-end gap-3 p-6 border-t border-border/30 bg-accent/5">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  className="rounded-xl transition-all duration-300"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => onOpenChange(false)}
                  className="rounded-xl transition-all duration-300"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}