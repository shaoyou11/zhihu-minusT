import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { effects } from '@/constants/designTokens';
import { useThemeColor } from './Themed';

export function GradientMaskOverlay({
  isDark,
  topEdge = 'gradient',
  bottomEdge = 'gradient',
}: {
  isDark: boolean;
  topEdge?: 'gradient' | 'page';
  bottomEdge?: 'gradient' | 'safe-area';
}) {
  const insets = useSafeAreaInsets();
  const overlayColor = useThemeColor({}, 'contentOverlayStrong');
  const pageColor = useThemeColor({}, 'background');

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {insets.top > 0 && topEdge === 'page' && (
        // The home tabs share the page surface. A card-tinted blur here would
        // recolor only the status area and recreate the two-tone header.
        <View
          testID="page-status-bar-surface"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top,
            backgroundColor: pageColor,
          }}
        />
      )}
      {insets.top > 0 && topEdge === 'gradient' && (
        <MaskedView
          testID="top-safe-area-gradient"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + 30,
            zIndex: 999,
          }}
          maskElement={
            <LinearGradient
              colors={effects.gradientMask.light}
              style={{ flex: 1 }}
            />
          }
        >
          <BlurView
            intensity={100}
            tint={isDark ? 'dark' : 'light'}
            style={{
              flex: 1,
              backgroundColor: overlayColor,
            }}
          />
        </MaskedView>
      )}
      {insets.bottom > 0 && (
        <MaskedView
          testID="bottom-safe-area-gradient"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            // Reading controls sit directly above the safe area. Do not lay
            // a second tinted blur over their glass or action labels.
            height: insets.bottom + (bottomEdge === 'safe-area' ? 0 : 30),
            zIndex: 999,
          }}
          maskElement={
            <LinearGradient
              colors={effects.gradientMask.dark}
              style={{ flex: 1 }}
            />
          }
        >
          <BlurView
            intensity={100}
            tint={isDark ? 'dark' : 'light'}
            style={{
              flex: 1,
              backgroundColor: overlayColor,
            }}
          />
        </MaskedView>
      )}
    </View>
  );
}
