import { useRecyclingState } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';

const MOVE_THRESHOLD = 2;
const LONG_PRESS_LOCK_DELAY_MS = 350;
const RESTORE_DELAY_MS = 100;

interface TouchCaptureHandlers {
  onTouchStartCapture: (event: GestureResponderEvent) => void;
  onTouchMoveCapture: (event: GestureResponderEvent) => void;
  onTouchEndCapture: () => void;
  onTouchCancelCapture: () => void;
}

export function useScrollAwareTextSelection(recyclingKey: string): {
  isTextSelectable: boolean;
  touchCaptureHandlers: TouchCaptureHandlers;
} {
  const [isTextSelectable, setIsTextSelectable] = useRecyclingState(true, [
    recyclingKey,
  ]);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isTextSelectionGestureRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearRestoreTimer = useCallback(() => {
    if (restoreTimerRef.current) {
      clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      clearRestoreTimer();
      clearLongPressTimer();
      isTextSelectionGestureRef.current = false;
      touchStartRef.current = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };
      setIsTextSelectable(true);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        if (touchStartRef.current) {
          isTextSelectionGestureRef.current = true;
        }
      }, LONG_PRESS_LOCK_DELAY_MS);
    },
    [clearLongPressTimer, clearRestoreTimer, setIsTextSelectable],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const start = touchStartRef.current;
      if (!start || isTextSelectionGestureRef.current) return;

      const deltaX = event.nativeEvent.pageX - start.x;
      const deltaY = event.nativeEvent.pageY - start.y;
      if (Math.hypot(deltaX, deltaY) < MOVE_THRESHOLD) return;

      clearLongPressTimer();
      touchStartRef.current = null;
      setIsTextSelectable(false);
    },
    [clearLongPressTimer, setIsTextSelectable],
  );

  const handleTouchFinish = useCallback(() => {
    clearLongPressTimer();
    touchStartRef.current = null;
    isTextSelectionGestureRef.current = false;
    clearRestoreTimer();
    restoreTimerRef.current = setTimeout(() => {
      restoreTimerRef.current = null;
      setIsTextSelectable(true);
    }, RESTORE_DELAY_MS);
  }, [clearLongPressTimer, clearRestoreTimer, setIsTextSelectable]);

  useEffect(
    () => () => {
      clearLongPressTimer();
      clearRestoreTimer();
    },
    [clearLongPressTimer, clearRestoreTimer],
  );

  // React Native supports these raw capture events at runtime, but its
  // TypeScript ViewProps currently omit them. Keeping them in a typed spread
  // avoids claiming the responder, so the surrounding list can still scroll.
  const touchCaptureHandlers = useMemo<TouchCaptureHandlers>(
    () => ({
      onTouchStartCapture: handleTouchStart,
      onTouchMoveCapture: handleTouchMove,
      onTouchEndCapture: handleTouchFinish,
      onTouchCancelCapture: handleTouchFinish,
    }),
    [handleTouchFinish, handleTouchMove, handleTouchStart],
  );

  return { isTextSelectable, touchCaptureHandlers };
}
