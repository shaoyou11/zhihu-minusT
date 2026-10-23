/** Materialize the reading header during the last 48px before its content exits. */
export function calculateDetailHeaderAppearance(
  offset: number,
  collapseOffset: number,
): number {
  'worklet';
  if (
    !Number.isFinite(offset) ||
    !Number.isFinite(collapseOffset) ||
    collapseOffset <= 0
  )
    return 0;
  const start = Math.max(0, collapseOffset - 48);
  return Math.max(0, Math.min(1, (offset - start) / (collapseOffset - start)));
}
