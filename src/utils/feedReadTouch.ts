import type { RawFeedItem } from '@/api/zhihu/feed';

export interface FeedReadTouchBatch {
  /** Distinguishes new responses even when a refresh returns identical IDs. */
  batchId: number;
  sessionVersion: number;
  answerIds: string[];
}

let nextBatchId = 0;

/** Capture the entire API batch before card parsing, filtering or local dedup. */
export function createFeedReadTouchBatch(
  items: readonly RawFeedItem[],
  sessionVersion: number,
): FeedReadTouchBatch {
  const ids = new Set<string>();
  for (const item of items) {
    const target = item.target ?? item;
    if (target.type !== 'answer') continue;
    // An unsafe numeric ID has already lost precision; never report a guessed ID.
    if (typeof target.id === 'number' && !Number.isSafeInteger(target.id))
      continue;
    const id = target.id?.toString().trim();
    if (id) ids.add(id);
  }
  return { batchId: nextBatchId++, sessionVersion, answerIds: [...ids] };
}
