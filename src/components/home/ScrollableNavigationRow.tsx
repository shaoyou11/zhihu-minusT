import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  type ScrollViewInstance,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

const TOP_TAB_WIDTH = 54;
const BOTTOM_ITEM_MIN_WIDTH = 64;

/** Reserve room for actual controls before adding the usual chrome margins. */
export function getHomeNavigationMetrics(
  paneWidth: number,
  bottomCount: number,
) {
  const width = Math.max(0, paneWidth);
  const topRoom = Math.max(0, (width - TOP_TAB_WIDTH) / 2);
  const topPadding = Math.min(8, topRoom);
  const topInset = Math.min(16, Math.max(0, topRoom - topPadding));
  const bottomViewportWidth = Math.min(width, Math.max(44, width - 40), 500);
  const bottomContentWidth = Math.max(
    bottomViewportWidth,
    bottomCount * BOTTOM_ITEM_MIN_WIDTH,
  );
  const bottomItemWidth = bottomContentWidth / Math.max(1, bottomCount);
  return {
    topInset,
    topPadding,
    bottomViewportWidth,
    bottomContentWidth,
    bottomItemWidth,
    bottomButtonWidth: bottomItemWidth - 20,
  };
}

interface ScrollableNavigationRowProps {
  children: ReactNode;
  contentWidth: number;
  activeStart: number;
  activeEnd: number;
  testID: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Keep full-size controls reachable without squeezing them to the pane width. */
export function ScrollableNavigationRow({
  children,
  contentWidth,
  activeStart,
  activeEnd,
  testID,
  style,
  contentStyle,
}: ScrollableNavigationRowProps) {
  const ref = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const rowWidth = Math.max(contentWidth, viewportWidth);

  useEffect(() => {
    if (viewportWidth <= 0) return;
    const maxOffset = Math.max(0, rowWidth - viewportWidth);
    let next = Math.min(offset.current, maxOffset);
    if (activeStart < next) next = activeStart;
    else if (activeEnd > next + viewportWidth) next = activeEnd - viewportWidth;
    next = Math.max(0, Math.min(next, maxOffset));
    if (Math.abs(next - offset.current) < 0.5) return;
    offset.current = next;
    ref.current?.scrollTo({ x: next, y: 0, animated: false });
  }, [activeStart, activeEnd, rowWidth, viewportWidth]);

  return (
    <ScrollView
      ref={ref}
      testID={testID}
      horizontal
      directionalLockEnabled
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      bounces={false}
      style={[styles.viewport, style]}
      onLayout={({ nativeEvent: { layout } }) => setViewportWidth(layout.width)}
      onScroll={({ nativeEvent }) => {
        offset.current = nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={16}
    >
      <View style={[styles.content, { width: rowWidth }, contentStyle]}>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minWidth: 0 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
});
