import { useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  type NativeSyntheticEvent,
  Platform,
  type ViewInstance,
} from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Position the composer against the keyboard top in the page's coordinates. */
export function useCommentKeyboardLayout(
  bottomInset: number,
  nativeAnchor = false,
) {
  const containerRef = useRef<ViewInstance>(null);
  const keyboardFrame = useRef(Keyboard.metrics());
  const measurementSequence = useRef(0);
  const mounted = useRef(nativeAnchor);
  const keyboardOverlap = useSharedValue(0);
  const keyboardVisible = useSharedValue(keyboardFrame.current !== undefined);

  const measureOverlap = useCallback(
    (duration = 0) => {
      if (nativeAnchor) return;
      const frame = keyboardFrame.current;
      const container = containerRef.current;
      const sequence = ++measurementSequence.current;
      if (!frame || !container) return;

      const applyMeasurement = (y: number, height: number) => {
        if (
          !mounted.current ||
          sequence !== measurementSequence.current ||
          containerRef.current !== container ||
          !Number.isFinite(y) ||
          !Number.isFinite(height) ||
          height <= 0
        )
          return;
        const overlap = Math.max(0, y + height - frame.screenY);
        // Android's DidShow arrives after the IME has opened. Delaying the
        // correction by another animation leaves the composer under the IME.
        keyboardOverlap.value =
          duration > 0 ? withTiming(overlap, { duration }) : overlap;
      };

      if (Platform.OS === 'android') {
        // Expo's Android root is edge-to-edge. measure's pageY is relative to
        // that root; measureInWindow would subtract the visible status bar.
        container.measure((_x, _y, _width, height, _pageX, pageY) =>
          applyMeasurement(pageY, height),
        );
      } else {
        // iOS keyboard frames are converted to window coordinates by RN.
        container.measureInWindow((_x, y, _width, height) =>
          applyMeasurement(y, height),
        );
      }
    },
    [keyboardOverlap, nativeAnchor],
  );

  const onNativeOverlapChange = useCallback(
    (event: NativeSyntheticEvent<{ height: number }>) => {
      const height = event.nativeEvent.height;
      if (mounted.current && nativeAnchor && Number.isFinite(height)) {
        keyboardOverlap.value = Math.max(0, height);
        keyboardVisible.value = height > 0;
      }
    },
    [nativeAnchor, keyboardOverlap, keyboardVisible],
  );

  const onContainerLayout = useCallback(
    () => measureOverlap(),
    [measureOverlap],
  );

  useEffect(() => {
    mounted.current = true;
    keyboardFrame.current = Keyboard.metrics();
    keyboardVisible.value = keyboardFrame.current !== undefined;
    measureOverlap();

    const show = (event: KeyboardEvent) => {
      keyboardFrame.current = event.endCoordinates;
      keyboardVisible.value = true;
      measureOverlap(Platform.OS === 'ios' ? event.duration || 250 : 0);
    };
    const hide = (event: KeyboardEvent) => {
      keyboardFrame.current = undefined;
      measurementSequence.current += 1;
      keyboardVisible.value = false;
      keyboardOverlap.value =
        Platform.OS === 'ios' && !nativeAnchor
          ? withTiming(0, { duration: event.duration || 250 })
          : 0;
    };
    const subscriptions = [
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        show,
      ),
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        hide,
      ),
    ];
    if (Platform.OS === 'ios') {
      subscriptions.push(
        Keyboard.addListener('keyboardWillChangeFrame', (event) => {
          if (keyboardFrame.current) show(event);
        }),
      );
    }
    return () => {
      mounted.current = false;
      measurementSequence.current += 1;
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [keyboardOverlap, keyboardVisible, measureOverlap, nativeAnchor]);

  const inputBarAnimatedStyle = useAnimatedStyle(() => ({
    bottom: keyboardOverlap.value,
    paddingBottom: keyboardVisible.value
      ? 12
      : bottomInset > 0
        ? bottomInset
        : 12,
  }));

  return {
    containerRef,
    onContainerLayout,
    inputBarAnimatedStyle,
    onNativeOverlapChange,
  };
}
