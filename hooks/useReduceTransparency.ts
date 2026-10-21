import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceTransparency() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (mounted) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setEnabled,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
