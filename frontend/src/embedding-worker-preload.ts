
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('embeddingWorkerAPI', {
  // Main -> Worker
  onTask: (callback: (args: { taskId: string, videoBlob: Buffer }) => void) => {
    ipcRenderer.on('video-embed:task', (event, args) => callback(args));
  },
  // Worker -> Main
  sendResult: (result: { taskId: string, result?: any, error?: string }) => {
    ipcRenderer.send('video-embed:result', result);
  },
});

contextBridge.exposeInMainWorld('vembedAPI', {
  getModelBytes: (): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('video-model:get-bytes'),
});