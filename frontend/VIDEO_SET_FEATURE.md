# Video Set Feature - Implementation Guide

## Overview

This PR demonstrates how to use the new **video set grouping feature** to concatenate short video recording chunks into long continuous videos.

## What Changed

### Backend (Server)
The backend now supports grouping video chunks into sets:
- Added `VideoSetMetadata` model to track which videos belong to which recording sessions
- Enhanced `/collections/insert` API to accept optional `video_set_id` parameter
- Enhanced `/collections/query` API with `query_video_sets` flag to retrieve entire video sets
- Enhanced `/collections/clear` API to delete corresponding metadata entries

### Frontend Changes

#### 1. **Type Definitions** (`src/services/collection.ts`)
```typescript
// Added video_set_id to VectorData
export interface VectorData {
  // ... existing fields
  video_set_id?: string; // Groups multiple video chunks together
}

// New interface for grouped video sets
export interface VideoSet {
  video_set_id: string;
  videos: VectorData[]; // Sorted by timestamp
}

// Updated QueryResponse to support both formats
export interface QueryResponse {
  ok: boolean;
  chat_results?: VectorData[];
  screen_results?: VectorData[] | VideoSet[]; // Can be flat or grouped
}
```

#### 2. **Storing Videos with Set ID** (`src/services/memory.ts`)
```typescript
// Updated storeVideoEmbedding to accept video_set_id
export async function storeVideoEmbedding(
  embedding: Float32Array | number[],
  videoBlob: Blob,
  metadata: {
    duration: number;
    width?: number;
    height?: number;
    video_set_id?: string // NEW: Group videos by recording session
  }
): Promise<void>
```

The `video_set_id` is automatically included when sending data to the server:
```typescript
const vectorData: VectorData = {
  id: `screen_${timestamp}`,
  vector: Array.from(embedding),
  content: encryptedPayload,
  timestamp,
  session_id: 0,
  role: 'screen_recording',
  video_set_id: metadata.video_set_id, // Sent to server
};
```

#### 3. **Recording with Set ID** (`src/components/ChatHeader.tsx`)
```typescript
useChunkedEmbeddingQueue({
  onEmbeddedChunk: async ({ chunk, pooled }) => {
    await memoryService.storeVideoEmbedding(
      pooled,
      chunk.blob,
      {
        duration: chunk.durationMs,
        width: chunk.width,
        height: chunk.height,
        video_set_id: chunk.recordingId, // Use recording session ID
      }
    );
  },
})
```

Each recording session generates a unique `recordingId` (UUID), and all chunks from that session share the same `video_set_id`.

#### 4. **Querying Video Sets** (`src/services/collection.ts`)
```typescript
// Updated queryScreenData to support video set expansion
export async function queryScreenData(
  indices: string[],
  outputFields: string[],
  queryVideoSets: boolean = false // NEW: Enable set expansion
): Promise<QueryResponse>
```

When `queryVideoSets=true`, the server returns ALL videos from the matching sets, grouped by `video_set_id`.

#### 5. **Merging Videos** (`src/services/collection.ts`)
```typescript
// New utility function to merge video blobs
export async function mergeVideoBlobs(videos: VectorData[]): Promise<Blob> {
  // Sorts videos by timestamp and concatenates blobs
  const sortedVideos = [...videos].sort((a, b) => a.timestamp - b.timestamp);
  const blobs = sortedVideos.map(v => v.video_blob).filter(Boolean);
  const mergedBlob = new Blob(blobs, { type: mimeType });
  return mergedBlob;
}
```

#### 6. **Automatic Set Handling in Search** (`src/services/collection.ts`)
The `searchAndQuery` function now automatically:
- Queries with `query_video_sets=true` for screen recordings
- Handles both flat list and grouped `VideoSet[]` responses
- Flattens grouped results for backward compatibility

```typescript
// Updated searchAndQuery to enable video set queries
const screenResult = await queryScreenData(
  screenIds,
  outputFields,
  true // Enable video set grouping
);

// Handle VideoSet[] format
if ('video_set_id' in firstResult && 'videos' in firstResult) {
  screenResults = (queryResult.screen_results as VideoSet[])
    .flatMap(set => set.videos);
}
```

## Usage Examples

See **`src/examples/video-set-usage.ts`** for comprehensive examples:

### Example 1: Recording (Already Working)
```typescript
// When user clicks "Start Recording":
// 1. System generates recordingId (UUID)
// 2. Records video in 30-second chunks
// 3. Each chunk sent with same video_set_id
// → All automatic, no code changes needed!
```

### Example 2: Query and Get Full Recording Sessions
```typescript
const results = await collectionService.searchAndQuery(
  queryEmbedding,
  3 // top-3 results
);
// Returns individual video chunks from matching recording sessions
```

### Example 3: Merge Videos from One Recording Session
```typescript
import { mergeVideoBlobs } from '@/services/collection';

// Get all videos from a recording session
const sessionVideos = results.filter(
  v => v.source_type === 'screen' && v.video_set_id === recordingId
);

// Merge into one large video
const mergedBlob = await mergeVideoBlobs(sessionVideos);
const videoUrl = URL.createObjectURL(mergedBlob);

// Use in video player
<video src={videoUrl} controls />
```

### Example 4: Group and Merge All Videos
```typescript
// Group videos by recording session
const videosBySet = new Map<string, VectorData[]>();
for (const video of videos) {
  if (video.video_set_id) {
    const existing = videosBySet.get(video.video_set_id) || [];
    existing.push(video);
    videosBySet.set(video.video_set_id, existing);
  }
}

// Merge each group
const mergedResults = await Promise.all(
  Array.from(videosBySet.entries()).map(async ([setId, setVideos]) => {
    const mergedBlob = await mergeVideoBlobs(setVideos);
    return {
      video_set_id: setId,
      blob: mergedBlob,
      url: URL.createObjectURL(mergedBlob),
      chunkCount: setVideos.length,
    };
  })
);
```

## How It Works End-to-End

### Recording Phase
1. User clicks "Start Recording" button
2. `startChunked()` generates unique `recordingId` (UUID)
3. Video is recorded in chunks (default: 30 seconds each)
4. Each chunk is:
   - Embedded using CLIP model
   - Stored with `video_set_id = recordingId`
   - Sent to server via `/collections/insert`

### Storage Phase
1. **Client**: Sends `VectorData` with `video_set_id`
2. **Server**:
   - Stores vector embedding in VectorDB
   - Stores metadata in `VideoSetMetadata` table
   - Links `video_id` to `video_set_id` for grouping

### Retrieval Phase
1. **Client**: Searches with query embedding
2. **Server**:
   - Finds top-K matching videos
   - If `query_video_sets=true`, expands to include ALL videos from matching sets
   - Returns grouped `VideoSet[]` with videos sorted by timestamp
3. **Client**:
   - Receives all chunks from recording sessions
   - Decrypts and reconstructs video blobs
   - Can merge chunks using `mergeVideoBlobs()`

### Display Phase
1. Merge video chunks: `const merged = await mergeVideoBlobs(videos)`
2. Create object URL: `const url = URL.createObjectURL(merged)`
3. Display in video player: `<video src={url} controls />`

## Key Benefits

✅ **Long recordings split into manageable chunks** - No memory issues with large videos

✅ **RAG search across all recordings** - Find relevant moments using semantic search

✅ **Full sessions reconstructed seamlessly** - All chunks preserved and properly ordered

✅ **Backward compatible** - Existing code works without changes

✅ **User isolation** - Each user's recordings are separate (enforced by server)

## Testing the Feature

1. **Start a recording session** (30+ seconds to generate multiple chunks)
2. **Stop the recording** and wait for processing to complete
3. **Query the database** to see that all chunks share the same `video_set_id`
4. **Search for relevant content** and verify full recording sessions are retrieved
5. **Merge videos** and verify playback quality

## Files Modified

### Frontend
- ✅ `src/services/memory.ts` - Added `video_set_id` parameter
- ✅ `src/services/collection.ts` - Updated types, APIs, and added `mergeVideoBlobs()`
- ✅ `src/components/ChatHeader.tsx` - Pass `recordingId` as `video_set_id`
- ✅ `src/examples/video-set-usage.ts` - Comprehensive usage examples

### Backend (Previously Implemented)
- ✅ `collection/models.py` - `VideoSetMetadata` model
- ✅ `collection/views.py` - Video set insert, query, and clear logic
- ✅ `collection/tests/test_views.py` - 35 passing tests

## Notes

- **Video merging** uses simple Blob concatenation (works for WebM format)
- For production, consider using `ffmpeg.wasm` for seamless playback
- **Object URLs** should be revoked when no longer needed: `URL.revokeObjectURL(url)`
- All videos are **encrypted** and only decrypted on the client
- Server enforces **user isolation** - users can only access their own recordings

## Next Steps

To fully utilize this feature in the UI:
1. Add video player component that displays merged recordings
2. Add UI to browse recording sessions by date/time
3. Add download button to save merged videos
4. Consider adding video trimming/editing capabilities
