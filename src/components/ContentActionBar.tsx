import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassContainer } from 'expo-glass-effect';
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BouncyButton } from '@/components/BouncyButton';
import {
  FloatingSurface,
  useIsLiquidGlassActive,
} from '@/components/surfaces/FloatingSurface';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { usePaneDimensions } from '@/features/adaptive-layout/PaneContext';
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
  style?: ComponentProps<typeof Animated.View>['style'];
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
  const useGlass = useIsLiquidGlassActive();
  const bottom = getContentActionBarBottom(bottomInset, bottomOffset);
  const reduceTransparency = useReduceTransparency();
  const glassColor = reduceTransparency
    ? colors.backgroundSecondary
    : colorScheme === 'dark'
      ? 'rgba(20,20,24,0.12)'
      : 'rgba(255,255,255,0.06)';
  // System material tints add their own opaque grey wash on iOS. A light
  // blur plus a thin highlight preserves the actual content behind the bar.
  const glassTint = colorScheme === 'dark' ? 'dark' : 'light';
  const { width: paneWidth } = usePaneDimensions();
  const availableWidth = Math.max(CONTENT_ACTION_BAR_HEIGHT, paneWidth - 32);
  const [contentWidth, setContentWidth] = useState(0);
  const [interactionExpanded, setInteractionExpanded] = useState(false);
  const morphs = Boolean(collapseProgress && onExpand);
  const [collapsed, setCollapsed] = useState(false);
  const targetWidth = interactionExpanded
    ? availableWidth
    : Math.max(
        CONTENT_ACTION_BAR_HEIGHT,
        Math.min(availableWidth, contentWidth || availableWidth),
      );
  const expandedWidth = useSharedValue(targetWidth);
  useEffect(() => {
    expandedWidth.value = withTiming(targetWidth, {
      duration: 200,
      reduceMotion: ReduceMotion.System,
    });
  }, [expandedWidth, targetWidth]);
  const updateCollapsed = useCallback((value: boolean) => {
    setCollapsed(value);
    if (value) setInteractionExpanded(false);
  }, []);
  useAnimatedReaction(
    () => (collapseProgress?.value ?? 0) >= 0.5,
    (value, previous) => {
      if (value !== previous) runOnJS(updateCollapsed)(value);
    },
    [collapseProgress, updateCollapsed],
  );
  const expandForInteraction = () => {
    if (!visible) return;
    setInteractionExpanded(true);
    onExpand?.();
  };
  const surfaceStyle = useAnimatedStyle(() => {
    const progress = morphs
      ? Math.max(0, Math.min(1, collapseProgress?.value ?? 0))
      : 0;
    // Fade controls before narrowing the surface; never compress the labels
    // during the morph. In reverse, the capsule opens before controls return.
    const contraction = interpolate(
      progress,
      [0.2, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const width = Math.min(expandedWidth.value, availableWidth);
    return {
      width: width + (CONTENT_ACTION_BAR_HEIGHT - width) * contraction,
      transform: [
        {
          translateY:
            useGlass && !visible ? bottom + CONTENT_ACTION_BAR_HEIGHT + 30 : 0,
        },
        {
          translateX:
            (16 - (paneWidth - CONTENT_ACTION_BAR_HEIGHT) / 2) * contraction,
        },
      ],
    };
  });
  const expandedStyle = useAnimatedStyle(() => {
    const progress = collapseProgress?.value ?? 0;
    return {
      // The viewport never follows the collapsing surface's width. Measuring
      // a child constrained by that width used to feed clipped widths back in.
      width: Math.min(expandedWidth.value, availableWidth),
      opacity: interpolate(progress, [0, 0.2], [1, 0], Extrapolation.CLAMP),
      pointerEvents:
        !visible || progress >= 0.2 ? ('none' as const) : ('auto' as const),
    };
  });
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress?.value ?? 0,
      [0.7, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    pointerEvents:
      visible && (collapseProgress?.value ?? 0) >= 0.5
        ? ('auto' as const)
        : ('none' as const),
  }));

  if (variant === 'islands') {
    const IslandsContainer = useGlass ? GlassContainer : View;

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
            opacity: useGlass ? 1 : visible ? 1 : 0,
            transform:
              useGlass && !visible
                ? [{ translateY: bottom + CONTENT_ACTION_BAR_HEIGHT + 30 }]
                : undefined,
          },
          style,
        ]}
      >
        <IslandsContainer
          {...(useGlass ? { spacing: 8 } : {})}
          style={styles.islandsInnerRow}
        >
          {leading ? (
            <View
              style={[
                styles.islandShadow,
                shrinkLeading && styles.shrinkableLeading,
                !useGlass && {
                  backgroundColor: glassColor,
                  ...(colorScheme === 'light'
                    ? { shadowColor: colors.shadow, ...styles.shadow }
                    : {}),
                },
              ]}
            >
              <FloatingSurface
                glassStyle="regular"
                colorScheme={colorScheme}
                intensity={reduceTransparency ? 0 : 24}
                tint={glassTint}
                style={[
                  styles.surface,
                  styles.islandLeading,
                  {
                    height: CONTENT_ACTION_BAR_HEIGHT,
                    borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                    borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
                    borderColor: useGlass ? undefined : colors.contentBorder,
                    backgroundColor: useGlass ? undefined : glassColor,
                  },
                ]}
              >
                {leading}
              </FloatingSurface>
            </View>
          ) : null}

          <View style={styles.islandRightGroup}>
            {trailing ? (
              <View
                style={[
                  styles.islandShadow,
                  !useGlass && {
                    backgroundColor: glassColor,
                    ...(colorScheme === 'light'
                      ? { shadowColor: colors.shadow, ...styles.shadow }
                      : {}),
                  },
                ]}
              >
                <FloatingSurface
                  glassStyle="regular"
                  colorScheme={colorScheme}
                  intensity={reduceTransparency ? 0 : 24}
                  tint={glassTint}
                  style={[
                    styles.surface,
                    styles.islandTrailing,
                    {
                      height: CONTENT_ACTION_BAR_HEIGHT,
                      borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                      borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
                      borderColor: useGlass ? undefined : colors.contentBorder,
                      backgroundColor: useGlass ? undefined : glassColor,
                    },
                  ]}
                >
                  {trailing}
                </FloatingSurface>
              </View>
            ) : null}

            {accessory ? (
              <View
                style={[
                  styles.islandShadow,
                  styles.islandAccessoryContainer,
                  !useGlass && {
                    backgroundColor: glassColor,
                    ...(colorScheme === 'light'
                      ? { shadowColor: colors.shadow, ...styles.shadow }
                      : {}),
                  },
                ]}
              >
                <FloatingSurface
                  glassStyle="regular"
                  colorScheme={colorScheme}
                  intensity={reduceTransparency ? 0 : 24}
                  tint={glassTint}
                  style={[
                    styles.surface,
                    styles.islandAccessory,
                    {
                      width: CONTENT_ACTION_BAR_HEIGHT,
                      height: CONTENT_ACTION_BAR_HEIGHT,
                      borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                      borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
                      borderColor: useGlass ? undefined : colors.contentBorder,
                      backgroundColor: useGlass ? undefined : glassColor,
                    },
                  ]}
                >
                  {accessory}
                </FloatingSurface>
              </View>
            ) : null}
          </View>
        </IslandsContainer>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      testID="content-action-bar"
      onTouchStart={expandForInteraction}
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
          opacity: useGlass ? 1 : visible ? 1 : 0,
          transform:
            useGlass && !visible
              ? [{ translateY: bottom + CONTENT_ACTION_BAR_HEIGHT + 30 }]
              : undefined,
        },
        !useGlass &&
          colorScheme === 'light' && {
            shadowColor: colors.shadow,
            ...styles.shadow,
          },
        style,
        surfaceStyle,
      ]}
    >
      <FloatingSurface
        glassStyle="regular"
        colorScheme={colorScheme}
        intensity={reduceTransparency ? 0 : 24}
        tint={glassTint}
        style={[
          styles.surface,
          {
            height: CONTENT_ACTION_BAR_HEIGHT,
            borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
            borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
            backgroundColor: useGlass ? undefined : glassColor,
            borderColor: useGlass ? undefined : colors.contentBorder,
          },
        ]}
      >
        <Animated.View
          testID="content-action-bar-viewport"
          accessibilityElementsHidden={collapsed}
          importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
          style={[styles.expandedContent, expandedStyle]}
        >
          <ScrollView
            testID="content-action-bar-actions"
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={contentWidth > availableWidth}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View
              testID="content-action-bar-intrinsic"
              style={styles.intrinsicContent}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                if (width > 0) setContentWidth(width);
              }}
            >
              {leading || trailing || accessory ? (
                <View style={styles.barRow}>
                  {leading ? (
                    <View style={styles.leadingSlot}>{leading}</View>
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
            </View>
          </ScrollView>
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
              onPress={expandForInteraction}
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
      </FloatingSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', zIndex: 1000 },
  compactContainer: {
    alignSelf: 'center',
  },
  surface: { overflow: 'hidden' },
  shadow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 4,
  },
  expandedContent: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    height: CONTENT_ACTION_BAR_HEIGHT,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  intrinsicContent: {
    flexShrink: 0,
  },
  barRow: {
    flexShrink: 0,
    height: CONTENT_ACTION_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
  },
  leadingSlot: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  trailingSlot: {
    flexShrink: 0,
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
    backgroundColor: 'transparent',
  },
  islandsInnerRow: {
    flex: 1,
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
