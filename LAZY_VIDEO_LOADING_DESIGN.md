# Lazy Video Loading Design Plan

## Problem Statement

The current lazy loading approach is flawed because:
- `queryScreenData()` fetches video **sets**, not individual videos
- If we pass 6 video_ids that all belong to the same set, we only get 1 video set back
- This makes it impossible to guarantee fetching exactly 6 video sets per page
- We need a new approach that queries incrementally until we have the required number of distinct video sets

## Solution Overview

Instead of fetching videos on page navigation, we'll use a **progressive batch loading** approach:
1. Query video_ids in small batches (18 at a time)
2. Track how many distinct video sets we've accumulated
3. Continue querying until we have 18 distinct sets (3 pages × 6 sets/page)
4. Show the video grid as soon as we have 6 sets for the first page
5. Continue loading in the background to populate pages 2 and 3

## Key Constants

```typescript
const BATCH_SIZE = 18;              // Query 18 video_ids at a time
const SETS_PER_PAGE = 6;            // Display 6 video sets per page
const TARGET_TOTAL_SETS = 18;       // Target: 3 pages × 6 sets = 18 total sets
const MIN_SETS_TO_SHOW = 6;         // Show UI after first 6 sets loaded
```

## Architecture Changes

### 1. New State Management in ChatInterface.tsx

```typescript
// Replace existing video state with:
const [videoLoadingState, setVideoLoadingState] = useState<{
  allVideoIds: string[];              // All video IDs from search
  loadedSets: VideoDoc[];             // Accumulated video sets (max 18)
  nextBatchStartIdx: number;          // Next index in allVideoIds to query
  isLoading: boolean;                 // Currently fetching a batch
  isComplete: boolean;                // Reached target or exhausted IDs
}>({
  allVideoIds: [],
  loadedSets: [],
  nextBatchStartIdx: 0,
  isLoading: false,
  isComplete: false,
});
```

### 2. Progressive Loading Flow

#### Phase 1: Initial Search (No Change)
- `searchVideos()` returns up to ~100 video_ids ranked by similarity
- Store these IDs in `videoLoadingState.allVideoIds`

#### Phase 2: First Batch Load (Replaces current fetchVideoPage)
```typescript
const loadNextBatch = async (): Promise<void> => {
  const { allVideoIds, loadedSets, nextBatchStartIdx, isComplete } = videoLoadingState;

  // Stop if we already have 18 sets or no more IDs
  if (isComplete || loadedSets.length >= TARGET_TOTAL_SETS) {
    return;
  }

  if (nextBatchStartIdx >= allVideoIds.length) {
    // Exhausted all video IDs
    setVideoLoadingState(prev => ({ ...prev, isComplete: true }));
    return;
  }

  setVideoLoadingState(prev => ({ ...prev, isLoading: true }));

  try {
    // Get next batch of video IDs
    const batchIds = allVideoIds.slice(
      nextBatchStartIdx,
      nextBatchStartIdx + BATCH_SIZE
    );

    // Query for video sets
    const queryResult = await queryScreenData(
      batchIds,
      ['content', 'timestamp', 'session_id', 'role', 'duration'],
      'video_set_hidden',
      [],
      [],
      true
    );

    // Process screen results into VideoDoc[]
    const newSets = processScreenResults(queryResult.screen_results);

    // Merge with existing sets (dedup by video_set_id)
    const allSets = mergeVideoSets(loadedSets, newSets);

    // Update state
    setVideoLoadingState(prev => ({
      ...prev,
      loadedSets: allSets.slice(0, TARGET_TOTAL_SETS),
      nextBatchStartIdx: nextBatchStartIdx + BATCH_SIZE,
      isLoading: false,
      isComplete: allSets.length >= TARGET_TOTAL_SETS,
    }));

    // Continue loading if we don't have enough sets yet
    if (allSets.length < TARGET_TOTAL_SETS && nextBatchStartIdx + BATCH_SIZE < allVideoIds.length) {
      // Schedule next batch (non-blocking)
      setTimeout(() => loadNextBatch(), 0);
    }
  } catch (error) {
    console.error('[loadNextBatch] Failed:', error);
    setVideoLoadingState(prev => ({ ...prev, isLoading: false }));
  }
};
```

#### Phase 3: Display Logic
```typescript
// Show video grid when we have at least 6 sets
const shouldShowVideos = videoLoadingState.loadedSets.length >= MIN_SETS_TO_SHOW;

// Build candidates from loaded sets
const videoCandidates = buildVideoCandidateList(videoLoadingState.loadedSets);

// Calculate total pages based on loaded sets
const totalPages = Math.min(
  Math.ceil(videoLoadingState.loadedSets.length / SETS_PER_PAGE),
  3
);
```

### 3. Helper Functions

#### mergeVideoSets
```typescript
function mergeVideoSets(existing: VideoDoc[], newSets: VideoDoc[]): VideoDoc[] {
  const setMap = new Map<string, VideoDoc>();

  // Add existing sets
  existing.forEach(set => {
    setMap.set(set.video_set_id, set);
  });

  // Add new sets (preserving search rank order)
  newSets.forEach(set => {
    if (!setMap.has(set.video_set_id)) {
      setMap.set(set.video_set_id, set);
    }
  });

  return Array.from(setMap.values());
}
```

#### processScreenResults
```typescript
function processScreenResults(screenResults: any[]): VideoDoc[] {
  const videoDocsForBatch: VideoDoc[] = [];

  if (!screenResults) return videoDocsForBatch;

  screenResults.forEach((doc: any, idx: number) => {
    const videos = doc.videos;
    if (!Array.isArray(videos) || videos.length === 0) return;

    const setId = doc.video_set_id?.toString() ?? `set_${idx}`;

    // Build sequence videos
    const sequenceVideos: VideoSequenceItem[] = videos.map((video: any, order: number) => ({
      id: video.id?.toString() ?? `${setId}_${order}`,
      blob: video.content,
      durationMs: video.duration,
      timestamp: video.timestamp,
      video_set_id: setId,
      url: undefined,
      order,
    })).filter(v => v.blob);

    if (sequenceVideos.length === 0) return;

    // Find representative video
    const representativeId = doc.representative_id ?? sequenceVideos[0].id;
    const representativeVideo =
      sequenceVideos.find(v => v.id === representativeId) ?? sequenceVideos[0];

    videoDocsForBatch.push({
      id: setId,
      blob: representativeVideo.blob,
      durationMs: representativeVideo.durationMs,
      timestamp: representativeVideo.timestamp,
      video_set_id: setId,
      representative_id: representativeId,
      sequence: sequenceVideos,
      score: doc._score ?? 0,
    });
  });

  return videoDocsForBatch;
}
```

### 4. Integration Points

#### In handleSendMessage (search phase)
```typescript
// After searchVideos returns video IDs:
if (videoIds.length > 0) {
  // Initialize loading state
  setVideoLoadingState({
    allVideoIds: videoIds,
    loadedSets: [],
    nextBatchStartIdx: 0,
    isLoading: false,
    isComplete: false,
  });

  // Start progressive loading
  loadNextBatch();
}
```

#### In VideoCandidateGrid
- Remove `onPageChange` prop (no longer needed)
- Keep `isLoadingPage` prop to show loading indicator while first batch loads
- Use client-side pagination from `videoLoadingState.loadedSets`

```typescript
// Pagination logic in ChatInterface:
const currentPageVideos = videoLoadingState.loadedSets
  .slice(currentPage * SETS_PER_PAGE, (currentPage + 1) * SETS_PER_PAGE);

const videoCandidates = buildVideoCandidateList(currentPageVideos);
```

## Loading States & UX

### State 1: Initial Loading (First 6 Sets)
- Show skeleton/spinner overlay on video grid
- Message: "Retrieving closest matches..."
- Grid appears as soon as 6 sets are loaded

### State 2: Background Loading (Sets 7-18)
- Grid is interactive and functional
- Subtle progress indicator (optional)
- Pagination enables automatically as more sets load

### State 3: Complete
- All 18 sets loaded OR exhausted all video IDs
- Full 3-page navigation available
- No loading indicators

## Edge Cases

### Case 1: Fewer than 6 sets found
- If after querying all video IDs we have < 6 sets, show what we have
- Hide pagination if only 1 page

### Case 2: Video IDs from same set
- The batch approach handles this naturally
- If first 18 IDs are all from the same set, we get 1 set, then continue with next batch
- Worst case: 36 IDs needed for 6 sets (if all sets have 6 videos and unlucky ordering)

### Case 3: Query errors
- Log error, mark isComplete to prevent infinite retries
- Show whatever sets were successfully loaded

### Case 4: User sends new message mid-loading
- Reset/cancel current loading state
- Clear `videoLoadingState` and start fresh

## Performance Optimizations

1. **Deduplication**: Track video_set_ids to avoid querying already-loaded sets
2. **Early termination**: Stop at 18 sets even if more IDs remain
3. **Parallel initial load**: Could split first 36 IDs into 2 parallel batches of 18
4. **Caching**: Keep `loadedSets` across page changes (already in state)

## Testing Scenarios

1. **Normal case**: 100 video IDs → all unique sets → loads 18 sets in 1 batch
2. **Duplicate sets**: 100 IDs → many from same sets → requires 2-3 batches to get 18 sets
3. **Sparse results**: Only 10 total video IDs → loads 10 sets, shows what's available
4. **Empty results**: 0 video IDs → no grid shown
5. **User interruption**: Loading in progress → user sends new query → old load cancelled

## Questions for Clarification

1. **Parallel loading**: Should we load the first 36 IDs in 2 parallel batches (18+18) to potentially get the first 6 sets faster?

2. **Loading indicator timing**: Should we show the grid immediately (empty/skeleton) when search completes, or wait until first 6 sets load?

3. **Progress feedback**: For sets 7-18 loading in background, should we show:
   - No indicator (silent background loading)
   - Subtle progress bar
   - Page 2/3 disabled state until loaded

4. **Error handling**: If a batch query fails midway through loading:
   - Retry the failed batch?
   - Stop loading and show what we have?
   - Show error message to user?

5. **Cancellation**: When user sends a new message during loading, should we:
   - Cancel ongoing queries?
   - Let them complete but discard results?

6. **Video blob memory**: Should we implement any cleanup for video blobs when switching sessions or after a certain number of queries?
