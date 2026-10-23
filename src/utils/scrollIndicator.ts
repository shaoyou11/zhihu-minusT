export interface ScrollIndicatorGeometry {
  visible: boolean;
  thumbHeight: number;
  thumbOffset: number;
}

/** Viewport height describes the ScrollView; track height may exclude overlays. */
export function calculateScrollIndicatorGeometry(
  scrollY: number,
  contentHeight: number,
  viewportHeight: number,
  trackHeight: number,
  minimumThumbHeight = 28,
): ScrollIndicatorGeometry {
  'worklet';
  if (
    !Number.isFinite(scrollY) ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(trackHeight) ||
    contentHeight <= 0 ||
    viewportHeight <= 0 ||
    trackHeight <= 0 ||
    contentHeight <= viewportHeight
  ) {
    return { visible: false, thumbHeight: 0, thumbOffset: 0 };
  }

  const minimum = Number.isFinite(minimumThumbHeight)
    ? Math.max(0, minimumThumbHeight)
    : 28;
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(minimum, (viewportHeight / contentHeight) * trackHeight),
  );
  const scrollableDistance = contentHeight - viewportHeight;
  const clampedOffset = Math.min(scrollableDistance, Math.max(0, scrollY));

  return {
    visible: true,
    thumbHeight,
    thumbOffset:
      (clampedOffset / scrollableDistance) * (trackHeight - thumbHeight),
  };
}
