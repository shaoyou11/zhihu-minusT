import type { ReactNode } from 'react';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';
import { useContentActionBarColor } from '@/components/ContentActionBarColor';
import { useThemeColor } from '@/components/Themed';
import { formatCount } from '@/utils/formatCount';

export const countedActionButtonStyle = {
  minWidth: 44,
  height: 44,
  paddingHorizontal: 6,
  paddingVertical: 0,
} as const;

/** Keep the icon and its count on the same line as the other actions. */
export function ActionIconCount({
  children,
  count,
  color,
}: {
  children: ReactNode;
  count?: number;
  color?: ColorValue;
}) {
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const actionColor = useContentActionBarColor(secondaryColor);
  const hasCount = count !== undefined && Number.isFinite(count) && count >= 0;

  return (
    <View
      testID="action-icon-count"
      style={styles.container}
      accessible={false}
    >
      {children}
      {hasCount ? (
        <Text
          accessible={false}
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[styles.count, { color: color ?? actionColor }]}
        >
          {formatCount(count)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});
