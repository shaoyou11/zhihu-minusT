function nonNegativeFinite(value: number) {
  'worklet';
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export const PROFILE_COVER_SCROLL_DISTANCE = 112;

/** Keep the same cover crop at toolbar height, then fade in its blurred image. */
export function getProfileCoverState(offset: number) {
  'worklet';
  const scroll = nonNegativeFinite(offset);
  return {
    translateY:
      scroll === 0 ? 0 : -Math.min(scroll, PROFILE_COVER_SCROLL_DISTANCE),
    blurOpacity: Math.min(
      1,
      Math.max(0, scroll - PROFILE_COVER_SCROLL_DISTANCE) / 48,
    ),
  };
}

/**
 * Share the visible header position between tabs. A partially expanded header
 * must move both ways; once collapsed, each tab keeps its deeper reading offset.
 */
export function getProfileSyncedOffset(
  sourceOffset: number,
  targetOffset: number,
  collapseDistance: number,
) {
  'worklet';
  const source = nonNegativeFinite(sourceOffset);
  const target = nonNegativeFinite(targetOffset);
  const distance = nonNegativeFinite(collapseDistance);
  return source < distance ? source : Math.max(target, distance);
}

/** Interpolate visible header positions, rather than the lists' reading offsets. */
export function getProfileHeaderOffset(
  offsets: readonly number[],
  pagerProgress: number,
  collapseDistance: number,
) {
  'worklet';
  if (offsets.length === 0) return 0;
  const distance = nonNegativeFinite(collapseDistance);
  const progress = Math.min(
    offsets.length - 1,
    nonNegativeFinite(pagerProgress),
  );
  const leftIndex = Math.floor(progress);
  const rightIndex = Math.ceil(progress);
  const fraction = progress - leftIndex;
  const leftOffset = Math.min(distance, nonNegativeFinite(offsets[leftIndex]));
  const rightOffset = Math.min(
    distance,
    nonNegativeFinite(offsets[rightIndex]),
  );
  return leftOffset + (rightOffset - leftOffset) * fraction;
}

/** Give an empty or short page enough real scroll range to collapse its header. */
export function getProfileMinContentHeight(
  viewportHeight: number,
  collapseDistance: number,
) {
  'worklet';
  return (
    nonNegativeFinite(viewportHeight) + nonNegativeFinite(collapseDistance)
  );
}

/**
 * Keep the expansion ratio while the header is visible, or the distance into
 * list content once it is collapsed. This covers rotation and text scaling.
 */
export function getProfileResizedOffset(
  offset: number,
  oldCollapse: number,
  newCollapse: number,
) {
  'worklet';
  const current = nonNegativeFinite(offset);
  const previousDistance = nonNegativeFinite(oldCollapse);
  const nextDistance = nonNegativeFinite(newCollapse);
  if (current === 0) return 0;
  if (current >= previousDistance) {
    return nextDistance + current - previousDistance;
  }
  return (current / previousDistance) * nextDistance;
}
