/**
 * Example: Using Video Set Feature
 *
 * This demonstrates how to use the new video set grouping feature
 * to record multiple video chunks and merge them into one large video.
 */

import { collectionService, mergeVideoBlobs, type VectorData } from '@/services/collection';

// ============================================================================
// SCENARIO 1: Recording Video Chunks (Already Implemented in ChatHeader)
// ============================================================================

/**
 * When a user starts recording, the system automatically:
 * 1. Generates a unique recordingId (UUID)
 * 2. Records video in chunks (default: 30 seconds each)
 * 3. Each chunk is sent to the server with the same video_set_id
 *
 * This is already implemented in ChatHeader.tsx:
 * - The recordingId is generated when startChunked() is called
 * - Each chunk has chunk.recordingId which is used as video_set_id
 * - storeVideoEmbedding receives video_set_id and sends it to the server
 */

// ============================================================================
// SCENARIO 2: Querying and Retrieving Video Sets
// ============================================================================

/**
 * Example: Search for videos and get full recording sessions
 */
async function exampleQueryVideoSets(queryEmbedding: number[]) {
  // This will:
  // 1. Search for relevant videos using embeddings
  // 2. Get top-K results
  // 3. Automatically fetch ALL videos from the same sets
  // 4. Return individual video chunks (already decrypted with video_blob)
  const results = await collectionService.searchAndQuery(
    queryEmbedding,
    3 // top-3 results
  );

  // Filter screen recordings
  const screenVideos = results.filter(r => r.source_type === 'screen');

  console.log(`Found ${screenVideos.length} video chunks`);

  return screenVideos;
}

/**
 * Example: Manually query specific videos and enable video set expansion
 */
async function exampleManualQuery(videoIds: string[]) {
  // Query with video set expansion enabled
  const response = await collectionService.queryScreenData(
    videoIds,
    ['content', 'timestamp', 'session_id', 'role'],
    true // query_video_sets = true
  );

  // Response will be in VideoSet[] format
  if (response.ok && response.screen_results) {
    console.log('Video sets:', response.screen_results);
    // Each set contains: { video_set_id: string, videos: VectorData[] }
  }

  return response;
}

// ============================================================================
// SCENARIO 3: Merging Video Chunks into One Large Video
// ============================================================================

/**
 * Example: Merge all videos from a recording session
 */
async function exampleMergeVideos(recordingId: string) {
  // Step 1: Query to get all videos from this recording session
  // (In a real app, you might search first to find relevant recording IDs)

  // For demo purposes, assume we have the videos from searchAndQuery
  const queryEmbedding = new Array(512).fill(0); // dummy embedding
  const allResults = await collectionService.searchAndQuery(queryEmbedding, 10);

  // Step 2: Filter videos from the specific recording session
  const sessionVideos = allResults.filter(
    v => v.source_type === 'screen' && v.video_set_id === recordingId
  );

  if (sessionVideos.length === 0) {
    console.log('No videos found for this recording session');
    return null;
  }

  console.log(`Found ${sessionVideos.length} video chunks from recording ${recordingId}`);

  // Step 3: Merge all video blobs into one large video
  const mergedBlob = await mergeVideoBlobs(sessionVideos);

  console.log(`Merged video size: ${(mergedBlob.size / 1024 / 1024).toFixed(2)} MB`);

  // Step 4: Use the merged video (e.g., create download link, display in video player)
  const videoUrl = URL.createObjectURL(mergedBlob);

  return {
    blob: mergedBlob,
    url: videoUrl,
    chunkCount: sessionVideos.length,
    totalDuration: sessionVideos.reduce((sum, v) => sum + (v.duration || 0), 0),
  };
}

/**
 * Example: Group videos by recording session and merge each group
 */
async function exampleGroupAndMergeAll(videos: VectorData[]) {
  // Group videos by video_set_id
  const videosBySet = new Map<string, VectorData[]>();

  for (const video of videos) {
    if (video.video_set_id) {
      const existing = videosBySet.get(video.video_set_id) || [];
      existing.push(video);
      videosBySet.set(video.video_set_id, existing);
    }
  }

  console.log(`Found ${videosBySet.size} unique recording sessions`);

  // Merge videos within each set
  const mergedResults = await Promise.all(
    Array.from(videosBySet.entries()).map(async ([setId, setVideos]) => {
      const mergedBlob = await mergeVideoBlobs(setVideos);
      return {
        video_set_id: setId,
        blob: mergedBlob,
        url: URL.createObjectURL(mergedBlob),
        chunkCount: setVideos.length,
        totalDuration: setVideos.reduce((sum, v) => sum + (v.duration || 0), 0),
      };
    })
  );

  return mergedResults;
}

// ============================================================================
// SCENARIO 4: Display Merged Video in UI
// ============================================================================

/**
 * Example React component usage (pseudo-code)
 */
/*
function VideoPlayer({ recordingId }: { recordingId: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadAndMergeVideo() {
      setLoading(true);
      try {
        const merged = await exampleMergeVideos(recordingId);
        if (merged) {
          setVideoUrl(merged.url);
        }
      } catch (error) {
        console.error('Failed to load video:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAndMergeVideo();

    // Cleanup: revoke object URL when component unmounts
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [recordingId]);

  if (loading) return <div>Loading video...</div>;
  if (!videoUrl) return <div>No video available</div>;

  return (
    <video
      src={videoUrl}
      controls
      style={{ width: '100%', maxWidth: '800px' }}
    />
  );
}
*/

// ============================================================================
// Summary
// ============================================================================

/**
 * HOW IT WORKS:
 *
 * 1. RECORDING:
 *    - User starts recording → system generates a recordingId (UUID)
 *    - Video is split into chunks (30s each)
 *    - Each chunk is stored with the same video_set_id = recordingId
 *
 * 2. STORAGE:
 *    - Client: Embeds each chunk and sends to server with video_set_id
 *    - Server: Stores VideoSetMetadata linking video_id to video_set_id
 *
 * 3. RETRIEVAL:
 *    - Client searches with embedding
 *    - Server finds matching videos
 *    - With query_video_sets=true, server returns ALL videos from matching sets
 *    - Videos are grouped by video_set_id and sorted by timestamp
 *
 * 4. MERGING:
 *    - Client receives all chunks from a recording session
 *    - Uses mergeVideoBlobs() to concatenate them into one large video
 *    - Result can be displayed in video player or downloaded
 *
 * KEY BENEFITS:
 * - Long recordings are stored as manageable chunks
 * - RAG search finds relevant moments across all recordings
 * - Full recording sessions can be reconstructed and viewed seamlessly
 * - No data loss - all chunks are preserved and properly ordered
 */

export {
  exampleQueryVideoSets,
  exampleManualQuery,
  exampleMergeVideos,
  exampleGroupAndMergeAll,
};
