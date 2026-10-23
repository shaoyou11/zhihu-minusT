import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { calculateDetailHeaderAppearance } from '@/utils/detailHeaderAppearance';

interface DetailHeaderOptions {
  scrollY?: SharedValue<number>;
  initialCollapseOffset?: number;
}

/** Shared reading-header state without overwriting UI-thread scroll samples. */
export function useDetailHeaderState(
  scope: string,
  {
    scrollY: externalScrollY,
    initialCollapseOffset = 80,
  }: DetailHeaderOptions = {},
) {
  const internalScrollY = useSharedValue(0);
  const scrollY = externalScrollY ?? internalScrollY;
  const initialOffset =
    Number.isFinite(initialCollapseOffset) && initialCollapseOffset > 0
      ? Math.max(1, initialCollapseOffset)
      : 80;
  const collapseOffset = useSharedValue(initialOffset);
  const headerProgress = useDerivedValue(() =>
    calculateDetailHeaderAppearance(scrollY.value, collapseOffset.value),
  );
  const epoch = useMemo(() => ({ scope, scrollY }), [scope, scrollY]);
  const activeEpoch = useRef<typeof epoch | null>(epoch);
  activeEpoch.current = epoch;
  const published = useRef({ epoch, collapsed: false });
  const [displayed, setDisplayed] = useState(published.current);

  const publishCollapsed = useCallback(
    (collapsed: boolean) => {
      if (activeEpoch.current !== epoch) return;
      if (
        published.current.epoch === epoch &&
        published.current.collapsed === collapsed
      )
        return;
      published.current = { epoch, collapsed };
      setDisplayed(published.current);
    },
    [epoch],
  );

  useLayoutEffect(() => {
    activeEpoch.current = epoch;
    scrollY.value = 0;
    collapseOffset.value = initialOffset;
    publishCollapsed(false);
    return () => {
      if (activeEpoch.current === epoch) activeEpoch.current = null;
    };
  }, [epoch, scrollY, collapseOffset, initialOffset, publishCollapsed]);

  const onScrollOffset = useCallback(
    (offset: number) => {
      if (activeEpoch.current !== epoch || !Number.isFinite(offset)) return;
      const nextOffset = Math.max(0, offset);
      // External scrollY belongs to the UI handler; a delayed JS sample must
      // never send its older position back to the animated header.
      if (!externalScrollY) scrollY.value = nextOffset;
      publishCollapsed(nextOffset >= collapseOffset.value);
    },
    [epoch, externalScrollY, scrollY, collapseOffset, publishCollapsed],
  );

  const onHeaderLayout = useCallback(
    (offset: number) => {
      if (
        activeEpoch.current !== epoch ||
        !Number.isFinite(offset) ||
        offset <= 0
      )
        return;
      const nextOffset = Math.max(1, offset);
      if (collapseOffset.value !== nextOffset)
        collapseOffset.value = nextOffset;
      if (Number.isFinite(scrollY.value))
        publishCollapsed(Math.max(0, scrollY.value) >= nextOffset);
    },
    [epoch, scrollY, collapseOffset, publishCollapsed],
  );

  return {
    scrollY,
    collapseOffset,
    headerProgress,
    collapsed: displayed.epoch === epoch && displayed.collapsed,
    onScrollOffset,
    onHeaderLayout,
  };
}
