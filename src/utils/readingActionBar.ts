/** Clamp bounce before accumulating travel so reversing always reveals the bar. */
export function nextReadingActionBarOffset(
  hidden: number,
  previousY: number,
  currentY: number,
  maxY: number,
  hideDistance: number,
): number {
  'worklet';
  const y = Math.max(0, Math.min(currentY, maxY));
  const previous = Math.max(0, Math.min(previousY, maxY));
  if (y <= 0) return 0;
  return Math.max(0, Math.min(hideDistance, hidden + y - previous));
}
