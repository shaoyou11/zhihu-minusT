import { useCallback, useEffect } from 'react';
import type { NativeScrollEvent } from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { CONTENT_ACTION_BAR_HEIGHT } from '@/components/ContentActionBar';
import { nextReadingActionBarOffset } from '@/utils/readingActionBar';

/** Only user scrolling hides actions; restoring reading progress leaves them available. */
export function useReadingActionBar(identity: string, bottom: number) {
  const offset = useSharedValue(0);
  const lastY = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const tracking = useSharedValue(false);
  const hideDistance = bottom + CONTENT_ACTION_BAR_HEIGHT + 16;

  useEffect(() => {
    void identity;
    offset.value = 0;
    tracking.value = false;
  }, [identity, offset, tracking]);

  const beginDrag = (event: NativeScrollEvent) => {
    'worklet';
    lastY.value = event.contentOffset.y;
    tracking.value = true;
  };
  const onScroll = (event: NativeScrollEvent) => {
    'worklet';
    scrollY.value = event.contentOffset.y;
    if (!tracking.value) return;
    offset.value = nextReadingActionBarOffset(
      offset.value,
      lastY.value,
      event.contentOffset.y,
      Math.max(0, event.contentSize.height - event.layoutMeasurement.height),
      hideDistance,
    );
    lastY.value = event.contentOffset.y;
  };
  const endScroll = () => {
    'worklet';
    tracking.value = false;
  };
  const collapseProgress = useDerivedValue(() => offset.value / hideDistance);
  const expand = useCallback(() => {
    tracking.value = false;
    offset.value = withTiming(0, { duration: 180 });
  }, [offset, tracking]);
  return { beginDrag, onScroll, endScroll, collapseProgress, expand, scrollY };
}
