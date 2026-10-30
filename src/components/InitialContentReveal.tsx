import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';

/** Fade the first measured body in without changing its measured height. */
export function InitialContentReveal({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const hasWaited = useRef(!ready);
  const hasRevealed = useRef(ready);
  const reduceMotion = useRef(true);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        reduceMotion.current = enabled;
        if (enabled) {
          opacity.stopAnimation();
          opacity.setValue(1);
        }
      },
    );
    return () => {
      mounted = false;
      subscription.remove();
      opacity.stopAnimation();
    };
  }, [opacity]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'android' || hasRevealed.current) return;
    if (!ready) {
      hasWaited.current = true;
      return;
    }
    hasRevealed.current = true;
    if (!hasWaited.current || reduceMotion.current) return;
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      opacity.setValue(1);
    };
  }, [opacity, ready]);

  return Platform.OS === 'android' ? (
    <Animated.View pointerEvents="box-none" style={{ opacity }}>
      {children}
    </Animated.View>
  ) : (
    children
  );
}
