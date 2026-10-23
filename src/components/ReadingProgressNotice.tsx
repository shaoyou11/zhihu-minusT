import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { CONTENT_ACTION_BAR_HEIGHT } from '@/components/ContentActionBar';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';
import { readableColor } from '@/utils/colorContrast';

interface ReadingProgressNoticeProps {
  visible: boolean;
  onBackToTop: () => void;
  onDismiss: () => void;
  bottomOffset?: number;
}

const NOTICE_DURATION_MS = 6000;

export function ReadingProgressNotice({
  visible,
  onBackToTop,
  onDismiss,
  bottomOffset = CONTENT_ACTION_BAR_HEIGHT + 24,
}: ReadingProgressNoticeProps) {
  const insets = useSafeAreaInsets();
  const colors = useRuntimeThemeColors();
  const backgroundColor = colors.toastSurface;
  const actionColor = colors.primary;
  const textColor = readableColor(colors.text, [backgroundColor]);
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      animation.setValue(0);
      return;
    }

    Animated.spring(animation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();

    const timer = setTimeout(onDismiss, NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [animation, onDismiss, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.container,
        {
          bottom: insets.bottom + bottomOffset,
          opacity: animation,
          transform: [
            {
              translateY: animation.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[styles.card, { backgroundColor }]} className="shadow-xl">
        <Text style={[styles.message, { color: textColor }]}>
          已定位到上次阅读处
        </Text>
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="回到正文顶部"
          onPress={onBackToTop}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: actionColor }]}>
            回到顶部
          </Text>
        </BouncyButton>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 1100,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 450,
    minHeight: 48,
    paddingLeft: 18,
    paddingRight: 8,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
