// src/components/VideoModelDownloadDialog.tsx
import { useState, useEffect, useRef } from 'react';
import { Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';

interface Props { open: boolean; onOpenChange?: (open: boolean) => void; }
type DownloadState = 'idle' | 'downloading' | 'completed' | 'error';

export default function VideoModelDownloadDialog({ open, onOpenChange }: Props) {
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transferred, setTransferred] = useState(0);
  const [total, setTotal] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [estimatedTimeLeft, setEstimatedTimeLeft] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  const MODEL_NAME = 'CLIP ViT-B/32 (Image Encoder)';
  const MODEL_SIZE = '~330 MB';

  useEffect(() => {
    const handleProgress = (p: { percent: number; transferred: number; total: number }) => {
      setProgress(p.percent * 100);
      setTransferred(p.transferred);
      setTotal(p.total);
      if (startTimeRef.current && p.transferred > 0) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const speed = p.transferred / elapsed;
        setDownloadSpeed(speed);
        if (p.total > 0 && speed > 0) setEstimatedTimeLeft((p.total - p.transferred) / speed);
      }
    };
    const handleComplete = () => {
      setDownloadState('completed');
      setProgress(100);
      setTimeout(() => onOpenChange?.(false), 1200);
    };
    const handleError = (msg: string) => {
      setDownloadState('error'); setError(msg);
    };

    window.vembedAPI.onDownloadProgress(handleProgress);
    window.vembedAPI.onDownloadComplete(handleComplete);
    window.vembedAPI.onDownloadError(handleError);
  }, [onOpenChange]);

  const start = async () => {
    setDownloadState('downloading'); setError(null); setProgress(0);
    startTimeRef.current = Date.now(); setDownloadSpeed(0); setEstimatedTimeLeft(0);
    const ok = await window.vembedAPI.startModelDownload();
    if (!ok.success) { setDownloadState('error'); setError(ok.error || 'Failed to start download'); }
  };

  const retry = () => {
    setDownloadState('idle'); setError(null); setProgress(0);
    startTimeRef.current = null; setDownloadSpeed(0); setEstimatedTimeLeft(0);
  };

  const fmtBytes = (b: number) => {
    if (b === 0) return '0 B';
    const k = 1024, u = ['B','KB','MB','GB']; const i = Math.floor(Math.log(b)/Math.log(k));
    return `${(b/Math.pow(k,i)).toFixed(2)} ${u[i]}`;
  };
  const fmtTime = (s: number) => s<60?`${Math.round(s)}s`:s<3600?`${Math.floor(s/60)}m ${Math.floor(s%60)}s`:`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;

  return (
    <Dialog open={open} onOpenChange={downloadState === 'idle' || downloadState === 'error' ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e)=>{ if (downloadState==='downloading') e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {downloadState === 'completed' ? (<><CheckCircle2 className="h-5 w-5 text-green-500"/>Download Complete</>)
              : downloadState === 'error' ? (<><AlertCircle className="h-5 w-5 text-destructive"/>Download Failed</>)
              : (<><Download className="h-5 w-5" /> Download Video Embedding Model</>)}
          </DialogTitle>
          <DialogDescription>
            {downloadState === 'completed' ? 'The video embedding model has been downloaded successfully.'
              : downloadState === 'error' ? 'There was a problem downloading the model.'
              : downloadState === 'downloading' ? `Downloading ${MODEL_NAME}. This may take a while...`
              : `To use video retrieval, you need to download ${MODEL_NAME} (${MODEL_SIZE}).`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {downloadState === 'error' && error && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4"/><AlertDescription>{error}</AlertDescription></Alert>
          )}

          {downloadState === 'idle' && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Model:</span><span className="font-medium">{MODEL_NAME}</span></div>
              <div className="flex justify-between"><span>Size:</span><span className="font-medium">{MODEL_SIZE}</span></div>
            </div>
          )}

          {downloadState === 'downloading' && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full"/>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{progress.toFixed(1)}%</span>
                {total>0 && <span>{fmtBytes(transferred)} / {fmtBytes(total)}</span>}
              </div>
              {downloadSpeed>0 && <div className="flex justify-end text-sm text-muted-foreground">
                {estimatedTimeLeft>0 && <span>Time left: {fmtTime(estimatedTimeLeft)}</span>}
              </div>}
            </div>
          )}

          {downloadState === 'completed' && (<Progress value={100} className="w-full"/>)}
        </div>

        <DialogFooter>
          {downloadState === 'idle' && <Button onClick={start} className="w-full"><Download className="mr-2 h-4 w-4"/>Start Download</Button>}
          {downloadState === 'error' && <Button onClick={retry} className="w-full">Retry Download</Button>}
          {downloadState === 'downloading' && <div className="w-full text-center text-sm text-muted-foreground">Please wait, do not close this window...</div>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
