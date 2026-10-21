import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { effects } from '@/constants/designTokens';
import { useThemeColor } from './Themed';

export function GradientMaskOverlay({
  isDark,
  showTop = true,
}: {
  isDark: boolean;
  showTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const overlayColor = useThemeColor({}, 'contentOverlayStrong');

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {showTop && insets.top > 0 && (
        <MaskedView
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
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: insets.bottom + 30,
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
