export const MIN_READING_PROGRESS_OFFSET = 160;
export const READING_COMPLETE_FRACTION = 0.97;
export const READING_COMPLETE_REMAINING_PX = 80;

export interface ReadingProgressEntry {
  offset: number;
  fraction?: number;
  scrollableDistance?: number;
  updatedAt: number;
}

export type ReadingProgressResult =
  | { status: 'active'; entry: ReadingProgressEntry }
  | { status: 'complete' }
  | { status: 'at-start' }
  | { status: 'not-scrollable' };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculateReadingProgress(
  offset: number,
  contentHeight: number,
  viewportHeight: number,
  updatedAt = Date.now(),
): ReadingProgressResult {
  const scrollableDistance = Math.max(0, contentHeight - viewportHeight);

  if (scrollableDistance <= 0) return { status: 'not-scrollable' };

  const safeOffset = clamp(offset, 0, scrollableDistance);
  if (safeOffset < MIN_READING_PROGRESS_OFFSET) return { status: 'at-start' };

  const fraction = safeOffset / scrollableDistance;
  const remaining = scrollableDistance - safeOffset;
  if (
    fraction >= READING_COMPLETE_FRACTION ||
    remaining <= READING_COMPLETE_REMAINING_PX
  ) {
    return { status: 'complete' };
  }

  return {
    status: 'active',
    entry: {
      offset: safeOffset,
      fraction,
      scrollableDistance,
      updatedAt,
    },
  };
}

export function resolveReadingProgressOffset(
  entry: ReadingProgressEntry,
  contentHeight: number,
  viewportHeight: number,
): number {
  const scrollableDistance = Math.max(0, contentHeight - viewportHeight);
  if (scrollableDistance <= 0) return 0;

  const savedDistance = entry.scrollableDistance;
  const hasComparableDistance =
    typeof savedDistance === 'number' && savedDistance > 0;
  const distanceChangedMaterially =
    hasComparableDistance &&
    Math.abs(scrollableDistance - savedDistance) / savedDistance > 0.02;

  const target =
    distanceChangedMaterially && typeof entry.fraction === 'number'
      ? entry.fraction * scrollableDistance
      : entry.offset;

  return clamp(target, 0, scrollableDistance);
}
