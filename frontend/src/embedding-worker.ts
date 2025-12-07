import { ClipVideoEmbedder } from './embedding/ClipVideoEmbedder'; // 기존 파일

console.log('Embedding Worker Process Started.');

ClipVideoEmbedder.get()
  .then(embedder => {
    console.log('Video embedder ready in worker process.');

    window.embeddingWorkerAPI.onTask(async ({ taskId, videoBlob }) => {
      try {
        // Convert to Blob from Buffer
        const blob = new Blob([videoBlob], { type: 'video/webm' }); 

        // Run embedding
        const result = await embedder.embedVideo(blob);

        // Transfer the result to main process
        window.embeddingWorkerAPI.sendResult({ taskId, result });

      } catch (e: any) {
        console.error('Embedding task failed:', e);
        window.embeddingWorkerAPI.sendResult({ taskId, error: e.message || 'Unknown error' });
      }
    });
  })
  .catch(err => {
    console.error('Failed to initialize embedder in worker:', err);
  });