import { useState, useEffect, useRef } from 'react';
import { Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';

interface ModelDownloadDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

type DownloadState = 'idle' | 'downloading' | 'completed' | 'error';

export function ModelDownloadDialog({ open, onOpenChange }: ModelDownloadDialogProps) {
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [currentModelName, setCurrentModelName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferred, setTransferred] = useState(0);
  const [total, setTotal] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Listen for download progress
    const handleProgress = (progressData: {modelName: string; percent: number; transferred: number; total: number }) => {
      setCurrentModelName(progressData.modelName);
      setProgress(progressData.percent * 100);
      setTransferred(progressData.transferred);
      setTotal(progressData.total);

      // Calculate download speed and estimated time
      if (startTimeRef.current && progressData.transferred > 0) {
        const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
        const speed = progressData.transferred / elapsedSeconds; // bytes per second
        setDownloadSpeed(speed);

        if (progressData.total > 0 && speed > 0) {
          const remainingBytes = progressData.total - progressData.transferred;
          const estimatedSeconds = remainingBytes / speed;
          setEstimatedTimeLeft(estimatedSeconds);
        }
      }
    };

    const handleComplete = () => {
      setDownloadState('completed');
      setProgress(100);
      setTimeout(() => {
        onOpenChange?.(false);
      }, 1500);
    };

    const handleError = (errorMessage: string) => {
      setDownloadState('error');
      setError(errorMessage);
    };

    window.llmAPI.onDownloadProgress(handleProgress);
    window.llmAPI.onDownloadComplete(handleComplete);
    window.llmAPI.onDownloadError(handleError);

    return () => {
      // Cleanup listeners would go here if we had a way to remove them
      // Currently the preload API doesn't expose removeListener for these events
    };
  }, [onOpenChange]);

  const handleStartDownload = async () => {
    setDownloadState('downloading');
    setCurrentModelName(null);
    setError(null);
    setProgress(0);
    startTimeRef.current = Date.now();
    setDownloadSpeed(0);
    setEstimatedTimeLeft(0);

    try {
      const result = await window.llmAPI.startModelDownload();
      if (!result.success) {
        setDownloadState('error');
        setError(result.error || 'Failed to start download');
      }
    } catch (err: any) {
      setDownloadState('error');
      setError(err.message || 'An unexpected error occurred');
    }
  };

  const handleRetry = () => {
    setDownloadState('idle');
    setCurrentModelName(null);
    setError(null);
    setProgress(0);
    startTimeRef.current = null;
    setDownloadSpeed(0);
    setEstimatedTimeLeft(0);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={downloadState === 'idle' || downloadState === 'error' ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => {
        // Prevent closing while downloading
        if (downloadState === 'downloading') {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {downloadState === 'completed' ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Download Complete
              </>
            ) : downloadState === 'error' ? (
              <>
                <AlertCircle className="h-5 w-5 text-destructive" />
                Download Failed
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download AI Model
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {downloadState === 'completed' ? (
              'All AI models have been downloaded successfully. Initializing...' // [수정]
            ) : downloadState === 'error' ? (
              'There was a problem downloading the AI models.' // [수정]
            ) : downloadState === 'downloading' ? (
              // [수정] currentModelName을 사용
              currentModelName 
                ? `Downloading: ${currentModelName}...` 
                : 'Preparing to download...'
            ) : (
              // [수정] 텍스트 일반화
              'To use the AI chat features, you need to download the required AI models (LLM and Embedders, ~7.3 GB total).'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {downloadState === 'error' && error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {downloadState === 'idle' && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>Models:</span>
                <span className="font-medium">Gemma-3n-E4B (LLM) + 2 DRAGON (Embedders)</span>
              </div>
              <div className="flex justify-between">
                <span>Total Size:</span>
                <span className="font-medium">~7.5 GB</span>
              </div>
              <div className="flex justify-between">
                <span>Context:</span>
                <span className="font-medium">32768 tokens</span>
              </div>
            </div>
          )}

          {downloadState === 'downloading' && (
            <div className="space-y-2">
              {currentModelName && (
                <div className="text-center text-sm font-medium">
                  {currentModelName}
                </div>
              )}
              <Progress value={progress} className="w-full" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{progress.toFixed(1)}%</span>
                {total > 0 && (
                  <span>{formatBytes(transferred)} / {formatBytes(total)}</span>
                )}
              </div>
              {downloadSpeed > 0 && (
                <div className="flex justify-end text-sm text-muted-foreground">
                  {estimatedTimeLeft > 0 && (
                    <span>Time left: {formatTime(estimatedTimeLeft)}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {downloadState === 'completed' && (
            <Progress value={100} className="w-full" />
          )}
        </div>

        <DialogFooter>
          {downloadState === 'idle' && (
            <Button onClick={handleStartDownload} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Start Download
            </Button>
          )}

          {downloadState === 'error' && (
            <Button onClick={handleRetry} variant="default" className="w-full">
              Retry Download
            </Button>
          )}

          {downloadState === 'downloading' && (
            <div className="w-full text-center text-sm text-muted-foreground">
              Please wait, do not close this window...
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
