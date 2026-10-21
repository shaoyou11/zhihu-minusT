import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';

export function DetailGlassSurface() {
  const colorScheme = useColorScheme();
  const background = useThemeColor({}, 'backgroundSecondary');
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  if (reduceTransparency) {
    return (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: background }]}
      />
    );
  }
  return (
    <BlurView
      intensity={100}
      tint={colorScheme}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor:
            colorScheme === 'dark'
              ? 'rgba(0,0,0,0.35)'
              : 'rgba(255,255,255,0.3)',
        },
      ]}
    />
  );
}
