import {
  type ComponentRef,
  forwardRef,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { ScrollViewProps } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

type GestureScrollViewInstance = ComponentRef<typeof ScrollView>;
export type GestureScrollViewRef = RefObject<GestureScrollViewInstance | null>;

// Pair this renderer with RNGH's RefreshControl so Android refresh and scroll
// handlers can coordinate on the actual native views.
export function useGestureScrollView() {
  const scrollGestureRef = useRef<GestureScrollViewInstance>(null);
  // FlashList recreates its scroller when the renderer identity changes.
  const renderScrollComponent = useMemo(
    () =>
      forwardRef<GestureScrollViewInstance, ScrollViewProps>(
        (props, forwardedRef) => {
          const setRef = useCallback(
            (node: GestureScrollViewInstance | null) => {
              scrollGestureRef.current = node;
              // FlashList still needs its ref for animated events and scrollToIndex.
              if (typeof forwardedRef === 'function') {
                return forwardedRef(node);
              }
              if (forwardedRef) forwardedRef.current = node;
            },
            [forwardedRef],
          );

          return (
            <ScrollView {...props} ref={setRef} disallowInterruption={false} />
          );
        },
      ),
    [],
  );

  return { scrollGestureRef, renderScrollComponent };
}
