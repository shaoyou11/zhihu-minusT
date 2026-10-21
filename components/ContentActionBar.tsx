import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { type ReactNode, useState } from 'react';
import {
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { BouncyButton } from '@/components/BouncyButton';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useReduceTransparency } from '@/hooks/useReduceTransparency';

export const CONTENT_ACTION_BAR_HEIGHT = 48;

export interface ContentActionBarProps {
  collapseProgress?: SharedValue<number>;
  onExpand?: () => void;
  bottomInset: number;
  bottomOffset?: number;
  variant?: 'bar' | 'islands';
  leading?: ReactNode;
  trailing?: ReactNode;
  accessory?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  visible?: boolean;
  shrinkLeading?: boolean;
}

/** Align with the home bar while preserving home-indicator clearance. */
export function getContentActionBarBottom(
  bottomInset: number,
  bottomOffset = 0,
): number {
  return Math.max(bottomInset + bottomOffset, 12);
}

/** Common floating surface; supports unified bar (Variant A) or floating islands (Variant B). */
export function ContentActionBar({
  collapseProgress,
  onExpand,
  bottomInset,
  bottomOffset = 0,
  variant = 'bar',
  leading,
  trailing,
  accessory,
  children,
  style,
  visible = true,
  shrinkLeading = false,
}: ContentActionBarProps) {
  const colors = useRuntimeThemeColors();
  const colorScheme = useColorScheme();
  const bottom = getContentActionBarBottom(bottomInset, bottomOffset);
  const reduceTransparency = useReduceTransparency();
  const glassColor = reduceTransparency
    ? colors.backgroundSecondary
    : colorScheme === 'dark'
      ? 'rgba(20,20,24,0.22)'
      : 'rgba(255,255,255,0.12)';
  const glassTint =
    colorScheme === 'dark'
      ? 'systemUltraThinMaterialDark'
      : 'systemUltraThinMaterialLight';
  const { width: windowWidth } = useWindowDimensions();
  const expandedWidth = useSharedValue(0);
  const morphs = Boolean(collapseProgress && onExpand);
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => (collapseProgress?.value ?? 0) >= 0.5,
    (value, previous) => {
      if (value !== previous) runOnJS(setCollapsed)(value);
    },
    [collapseProgress],
  );
  const surfaceStyle = useAnimatedStyle(() => {
    if (!morphs || expandedWidth.value <= 0) return {};
    const progress = Math.max(0, Math.min(1, collapseProgress?.value ?? 0));
    const width = Math.min(expandedWidth.value, windowWidth * 0.92);
    return {
      width: width + (CONTENT_ACTION_BAR_HEIGHT - width) * progress,
      transform: [
        {
          translateX:
            (16 - (windowWidth - CONTENT_ACTION_BAR_HEIGHT) / 2) * progress,
        },
      ],
    };
  });
  const expandedStyle = useAnimatedStyle(() => {
    const progress = collapseProgress?.value ?? 0;
    return {
      opacity: interpolate(progress, [0, 0.65], [1, 0], Extrapolation.CLAMP),
      pointerEvents:
        !visible || progress >= 0.5 ? ('none' as const) : ('auto' as const),
    };
  });
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress?.value ?? 0,
      [0.45, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    pointerEvents:
      visible && (collapseProgress?.value ?? 0) >= 0.5
        ? ('auto' as const)
        : ('none' as const),
  }));

  if (variant === 'islands') {
    return (
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.container,
          styles.islandsContainer,
          {
            bottom,
            height: CONTENT_ACTION_BAR_HEIGHT,
            opacity: visible ? 1 : 0,
          },
          style,
        ]}
      >
        {leading ? (
          <View
            style={[
              styles.islandShadow,
              shrinkLeading && styles.shrinkableLeading,
              {
                backgroundColor: glassColor,
              },
              colorScheme === 'light' && {
                shadowColor: colors.shadow,
                ...styles.shadow,
              },
            ]}
          >
            <BlurView
              intensity={reduceTransparency ? 0 : 65}
              tint={glassTint}
              style={[
                styles.surface,
                styles.islandLeading,
                {
                  height: CONTENT_ACTION_BAR_HEIGHT,
                  borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                  borderColor: colors.contentBorder,
                },
              ]}
            >
              {leading}
            </BlurView>
          </View>
        ) : null}

        <View style={styles.islandRightGroup}>
          {trailing ? (
            <View
              style={[
                styles.islandShadow,
                {
                  backgroundColor: glassColor,
                },
                colorScheme === 'light' && {
                  shadowColor: colors.shadow,
                  ...styles.shadow,
                },
              ]}
            >
              <BlurView
                intensity={reduceTransparency ? 0 : 65}
                tint={glassTint}
                style={[
                  styles.surface,
                  styles.islandTrailing,
                  {
                    height: CONTENT_ACTION_BAR_HEIGHT,
                    borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                    borderColor: colors.contentBorder,
                  },
                ]}
              >
                {trailing}
              </BlurView>
            </View>
          ) : null}

          {accessory ? (
            <View
              style={[
                styles.islandShadow,
                styles.islandAccessoryContainer,
                {
                  backgroundColor: glassColor,
                },
                colorScheme === 'light' && {
                  shadowColor: colors.shadow,
                  ...styles.shadow,
                },
              ]}
            >
              <BlurView
                intensity={reduceTransparency ? 0 : 65}
                tint={glassTint}
                style={[
                  styles.surface,
                  styles.islandAccessory,
                  {
                    width: CONTENT_ACTION_BAR_HEIGHT,
                    height: CONTENT_ACTION_BAR_HEIGHT,
                    borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                    borderColor: colors.contentBorder,
                  },
                ]}
              >
                {accessory}
              </BlurView>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.container,
        styles.compactContainer,
        {
          bottom,
          height: CONTENT_ACTION_BAR_HEIGHT,
          borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
          opacity: visible ? 1 : 0,
        },
        colorScheme === 'light' && {
          shadowColor: colors.shadow,
          ...styles.shadow,
        },
        style,
        surfaceStyle,
      ]}
    >
      <BlurView
        intensity={reduceTransparency ? 0 : 65}
        tint={glassTint}
        style={[
          styles.surface,
          {
            height: CONTENT_ACTION_BAR_HEIGHT,
            borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
            backgroundColor: glassColor,
            borderColor: colors.contentBorder,
          },
        ]}
      >
        <Animated.View
          accessibilityElementsHidden={collapsed}
          importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
          onLayout={(event) => {
            if (morphs) expandedWidth.value = event.nativeEvent.layout.width;
          }}
          style={[styles.expandedContent, expandedStyle]}
        >
          {leading || trailing || accessory ? (
            <View style={styles.barRow}>
              {leading ? (
                <View
                  style={[
                    styles.leadingSlot,
                    shrinkLeading && styles.shrinkableLeading,
                  ]}
                >
                  {leading}
                </View>
              ) : null}
              <View style={styles.trailingSlot}>
                {trailing}
                {accessory ? (
                  <View style={styles.accessorySlot}>{accessory}</View>
                ) : null}
              </View>
            </View>
          ) : (
            children
          )}
        </Animated.View>
        {morphs && (
          <Animated.View
            pointerEvents={visible && collapsed ? 'auto' : 'none'}
            accessibilityElementsHidden={!collapsed}
            importantForAccessibility={
              collapsed ? 'auto' : 'no-hide-descendants'
            }
            style={[StyleSheet.absoluteFill, iconStyle]}
          >
            <BouncyButton
              accessibilityRole="button"
              accessibilityLabel="展开阅读操作栏"
              onPress={onExpand}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={24}
                color={colors.text}
              />
            </BouncyButton>
          </Animated.View>
        )}
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 1000 },
  compactContainer: {
    alignSelf: 'center',
    maxWidth: '92%',
  },
  surface: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  shadow: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  expandedContent: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    height: CONTENT_ACTION_BAR_HEIGHT,
  },
  barRow: {
    height: CONTENT_ACTION_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
  },
  leadingSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  trailingSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  accessorySlot: {
    marginLeft: 8,
    backgroundColor: 'transparent',
  },
  islandsContainer: {
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  islandShadow: {
    height: CONTENT_ACTION_BAR_HEIGHT,
    borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
  },
  islandLeading: {
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shrinkableLeading: {
    flexShrink: 1,
    minWidth: 0,
  },
  islandRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  islandTrailing: {
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandAccessory: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandAccessoryContainer: {
    width: CONTENT_ACTION_BAR_HEIGHT,
    marginLeft: 8,
  },
});
